# Queue switch fix

- Queue play/original broadcasts `autoplay: true`.
- The room stream endpoint honors the exact pCloud ref in `v`, avoiding a DB/source race during live switching.
- The player remounts on source URL changes and attempts immediate playback.
- Queue items remain queued until explicit Remove.
