# Decisions

- 2026-10-20: `plan/` e `.context/` sono versionati nel repository. Il runner GitHub controlla il
  repo e deve poter leggere la memoria di sessione, adottare l'issue nel board, spostare il piano e
  committarlo: qualunque path fuori dal checkout (il vecchio layout a junction) e' invisibile al
  runner. La telemetria (`.context/comprehension-log.md`, `.context/research-dataset.jsonl`) resta
  fuori dal versionamento.
