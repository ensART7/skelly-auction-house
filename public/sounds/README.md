# Auction sounds

Drop any of these files here and list them in `manifest.json`:

- `auction-bell.mp3`: page open (plays once)
- `new-bidder.mp3`: a new wallet joins (pop + chair thump)
- `new-bid.mp3`: a new active offer (ding)
- `bid-increase.mp3`: an existing bidder raises their offer (hammer tap)
- `top-bidder.mp3`: the highest bidder changes (fanfare)

Example `manifest.json`: `{ "files": ["new-bid.mp3", "top-bidder.mp3"] }`

Any sound that is not listed falls back to a short built-in synthesized version, so the site works with zero files. Keep each file short (under 1 second, except the bell and fanfare at about 1.5 seconds) and normalized to roughly −14 LUFS.
