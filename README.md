# Tai Chi Practice System Services Section

This engineering section owns the composed computer system through which a
person studies Tai Chi resources, imports and exports personal practice state,
observes movement, and interacts with later teacher services.

Read the [system constitution](content/text/documents/articles/notes/2026/08/19/2026-08-19-tai-chi-practice-system-constitution.md)
and the upstream [science and system architecture](../../../../../../../../../../../science-services-section/services/natural-science-services-section/services/biological-science-services-section/services/medical-science-services-section/services/medical-services-section/services/health-services-section/services/fitness-services-section/services/martial-arts-services-section/services/tai-chi-services-section/content/text/documents/articles/notes/2026/08/19/2026-08-19-tai-chi-science-and-computer-system-architecture.md)
before adding application behavior.

Durable practitioner records live in the [personal Tai Chi state
section](../../../../../../../../../../../public-services-section/services/personal-services-section/services/emsenn-services-section/services/emsenn-medical-services-section/services/health-services-section/services/emsenn-fitness-services-section/services/emsenn-martial-arts-services-section/services/emsenn-tai-chi-services-section/),
not in this computer system.

## Admitted applications

- `apps/tai-chi-practice-computer` — pure application core and port
  contracts; no ambient camera, filesystem, network, key, or clock.

Browser capture, local filesystem custody, and teacher exchange are separate
adapters or services. Only the first is admitted in principle; none is
materialized merely by being named.
