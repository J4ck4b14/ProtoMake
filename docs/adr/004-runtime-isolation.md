# ADR 004: Host-driven runtime and independent worlds

Accepted for Milestone 0.

Keep runtime scheduling independent of browser DOM. Hosts call tick with elapsed seconds. Systems execute in registration order, fixed before variable updates, and tear down in reverse. Errors propagate with context.

Deserialize authored scenes into new worlds for runtime ownership. This gives data isolation today and a clear boundary for a later iframe-based Play Mode. It does not claim to sandbox project scripts. Browser animation scheduling belongs in the current example host, not in engine core.
