# Sample Build Hooks Plugin

This is a server-side-only sample for the agent builder hook API.

It demonstrates:

- `onBuildPrepare` and `onBuildTarget` for observing build state.
- `buildHooks.post_build` for seeing the raw Go build output.
- `buildHooks.before_donut` and `buildHooks.after_donut` for Donut shellcode conversion.
- `buildHooks.before_sgn` and `buildHooks.after_sgn` for SGN shellcode encoding.
- `onBuildArtifact` for replacing the downloadable output with a `.txt` file containing `test`.
- A custom Build Plugins button named `Build Test TXT`.
- `onBuildComplete` and `onBuildFailed` for post-build automation.
- A small UI that reads recent hook activity from the plugin's SQLite database.

Run `build.bat` from this directory to create `sample-build-hooks.zip`, then upload it on the Plugins page or place the zip where the server loads plugins.
