#!/bin/sh
# Invoca l'install OpenCode V2 ISOLATA nel profilo "fm" (FreeLLMAPI) da MSYS/git-bash, headless.
#
# Perche' un wrapper:
#  - l'exe nativo eredita il $PWD POSIX della shell e muore con
#      Error: Failed to change directory to /e/...
#    (neutralizzare PWD davanti allo shim non basta: lo shim `sh` ri-esporta il proprio PWD);
#  - V2 non va mai lanciato senza i suoi XDG_* root, o punta il data dir su quello di V1;
#  - i root del profilo fm (*-fm) non sono quelli che `oc2run.sh`/`oc2-fm` userebbero per il profilo default.
#
# Uso, da DENTRO la directory del progetto (il progetto e' il cwd, non un argomento):
#   OC2_HOME=C:/Users/<tu>/.opencode2 bash scripts/oc2-fm-run.sh run -m freellmapi/auto:smart "say OK"
#   OC2_HOME=C:/Users/<tu>/.opencode2 bash scripts/oc2-fm-run.sh debug agents
#
# Nota: `run --agent <id>` NON applica il modello dell'agente: passare sempre `-m freellmapi/<alias>`.
set -u

OC2="${OC2_HOME:?set OC2_HOME al prefisso privato di V2, es. C:/Users/<tu>/.opencode2}"
EXE="$OC2/node_modules/@opencode/cli/bin/opencode.exe"

if [ ! -f "$EXE" ]; then
  echo "oc2-fm-run: no V2 binary at $EXE (OC2_HOME=$OC2)" >&2
  exit 127
fi
# Un launcher da 229 byte significa che il postinstall non e' stato eseguito: il binario vero
# sta nel pacchetto fratello @opencode/cli-windows-x64. Fallire subito invece di aspettare
# 'Timed out waiting for the background service to start'.
if [ "$(wc -c < "$EXE")" -lt 10000 ]; then
  echo "oc2-fm-run: $EXE sembra il placeholder del postinstall (esegui postinstall.mjs)" >&2
  exit 127
fi
if [ ! -d "$OC2/config-fm/opencode" ]; then
  echo "oc2-fm-run: profilo fm assente in $OC2/config-fm/opencode (crealo con scripts/setup-oc2-fm-profile.sh)" >&2
  exit 127
fi

env -u PWD \
  XDG_DATA_HOME="$OC2/data-fm"   XDG_CONFIG_HOME="$OC2/config-fm" \
  XDG_STATE_HOME="$OC2/state-fm" XDG_CACHE_HOME="$OC2/cache-fm" \
  "$EXE" "$@"
