# Account project continuity

ProtoMake still works fully offline with IndexedDB saves and JSON import/export. The **Account** dialog adds an optional project-sync path for opening the same authored project on another browser/device.

## Local development

Run:

```sh
npm run dev:account
```

This starts the editor plus the reference account server. The editor defaults to `/api`, and Vite proxies that route to the local server. Create an account in **Account**, then choose **Save current to account**. Once a project has a cloud revision, normal **Save** writes the local IndexedDB copy and then syncs that linked project.

The reference server stores accounts/projects under `.protomake/accounts.json` (gitignored). Passwords are salted and hashed with Node's `scrypt`; bounded-length passwords are enforced and bearer sessions are expiring/revocable records kept in server memory. Authentication attempts are bounded per remote address, project counts/payload sizes have configurable quotas, and API responses carry defensive headers. Cloud project writes use monotonically increasing revisions. A stale desktop/phone copy receives a conflict instead of silently overwriting the newer revision.

## Another device / mobile

A phone cannot reach `127.0.0.1` on your desktop. For a trusted local-network test, run `PROTOMAKE_HOST=0.0.0.0 npm run dev:account`, open the desktop machine's LAN address from the phone, and keep the Account server field at `/api`; Vite proxies the phone's same-origin `/api` requests to the local account service. Do not expose an unprotected development machine to an untrusted network.

For a deployed cross-device setup, serve ProtoMake from a reachable HTTPS origin and normally reverse-proxy `/api` to the account server. The server bind address can be changed with `PROTOMAKE_ACCOUNT_HOST`; if you intentionally put the API on a different browser origin, set one exact allowed origin with `PROTOMAKE_ACCOUNT_ORIGIN` and enter that API URL in the Account dialog. Both devices then sign into the same account and can open the saved cloud project.

Changing the configured Account server clears the current bearer session and remembered cloud revisions before any request is sent to the new endpoint; a token issued by one ProtoMake server is never intentionally carried to another. Cloud project reads expose project data/revision metadata but omit server-internal ownership records.

The included server is a small self-hostable reference backend, not a production identity service. Before exposing it publicly, add the operational controls expected for your deployment: TLS at the proxy, rate limiting, backups, password reset/email verification if required, monitoring and an appropriate database/storage strategy.

## Conflict behavior

Every cloud project has a revision. Loading a project records its current revision on that device. Saving sends that revision back. If another device has already created a newer revision, the older save is rejected with a conflict; reopen the cloud copy before deciding how to reconcile changes. ProtoMake does not silently merge arbitrary scene/project JSON.

Signing out clears the device's cloud-revision links. It does not delete local IndexedDB saves or cloud projects.
