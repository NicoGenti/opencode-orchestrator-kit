# Checklist CI

Da percorrere prima di aprire una PR (equivalente a `bun run bun:audit`):

- [ ] `bun test` passa (tutta la suite, exit 0)
- [ ] `bun run lint` passa (exit 0)
- [ ] `bun run format:check` passa (exit 0)
- [ ] Nessuna modifica ai lockfile (`bun.lockb`, `package-lock.json`)
