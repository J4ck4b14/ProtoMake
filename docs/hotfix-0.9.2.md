# ProtoMake 0.9.2 certification hotfix

ProtoMake 0.9.2 closes the final certification issues found during the Windows release run.

- The partial-shadow lighting regression test now compares exposed and shadowed samples at equal distance from the light, so distance attenuation cannot invert the assertion.
- Release version metadata is 0.9.2.
- Run `npm run format` after a clean install before the lint/test/build certification sequence.

The expected automated suite remains 106 tests.
