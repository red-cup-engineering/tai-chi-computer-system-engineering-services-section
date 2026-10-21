# Tai Chi Practice System Services Section

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

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
