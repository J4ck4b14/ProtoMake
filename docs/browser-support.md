# Browser and platform support

The editor and exported player target current stable desktop Chrome, Edge, Firefox, and Safari releases with WebGL 2, Web Audio, ES modules, IndexedDB, and modern DOM APIs enabled. Chromium-based Android browsers and mobile Safari provide the compact touch workspace, but desktop remains the primary authoring environment.

Node.js 22.12+ and npm 11.9.0 are the supported development toolchain. Production web exports are static files and do not need Node at runtime. Serve them over HTTP(S); direct `file://` launch is unsupported because module, audio, and storage policies vary by browser.

GPU output, codecs, gamepad mappings, storage quotas, and audio-unlock policy vary by browser/OS. Run the browser checklist on each shipping target. Firefox/Safari and real-device mobile passes are required for a broad public compatibility claim; repository CI alone does not make that claim.
