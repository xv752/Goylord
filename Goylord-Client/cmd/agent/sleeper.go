package main

import "time"

func sleepObfuscated(seconds int) {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	if seconds <= 0 {
		return
	}
	const slice = 500 * time.Millisecond
	end := time.Now().Add(time.Duration(seconds) * time.Second)
	for {
		remaining := time.Until(end)
		if remaining <= 0 {
			return
		}
		next := remaining
		if next > slice {
			next = slice
		}
		time.Sleep(next)
	}
}
