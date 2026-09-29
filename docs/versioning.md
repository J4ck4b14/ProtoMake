# Versioning policy

ProtoMake release versions follow `major.minor.patch`. While the project is pre-1.0, a minor release may add or revise public engine APIs; patch releases are reserved for compatible fixes and release hardening.

Project, scene, save, Behaviour Graph and Interchange schema versions are independent integers. A schema change advances exactly one version and includes a sequential migration when older data can be upgraded safely. Unknown newer schemas fail visibly instead of being guessed at.

Package versions describe repository modules, while authored project data relies on schema validation and migration. Export manifests record the ProtoMake engine version and Interchange schema used to produce the target bundle so diagnostics can be reproduced without coupling target output to a particular documentation timeline.
