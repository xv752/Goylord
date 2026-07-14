package wire

import "github.com/vmihailenco/msgpack/v5"

func DecodeEnvelope(data []byte) (map[string]interface{}, error) {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	env := make(map[string]interface{})
	if err := msgpack.Unmarshal(data, &env); err != nil {
		return nil, err
	}
	return env, nil
}
