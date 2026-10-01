#!/bin/bash
echo ""
echo "  ============================================"
echo "   Orçamentos"
echo "  ============================================"
echo ""

if ! command -v node &> /dev/null; then
    echo "  ERRO: Node.js não encontrado."
    echo "  Instale o Node.js 24 (LTS) em: https://nodejs.org"
    exit 1
fi

VERSAO=$(node -p "process.versions.node.split('.')[0]")
if [ "$VERSAO" -lt 24 ]; then
    echo "  ERRO: esta versão precisa do Node.js 24 ou mais novo (encontrado: $(node --version))."
    echo "  Instale o Node.js 24 (LTS) em: https://nodejs.org"
    exit 1
fi

cd "$(dirname "$0")"
PORTA=$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2)
PORTA=${PORTA:-3333}

echo "  Iniciando servidor em http://localhost:$PORTA"
echo "  Para parar: Ctrl+C"
echo ""

(sleep 3 && open "http://localhost:$PORTA" 2>/dev/null || xdg-open "http://localhost:$PORTA" 2>/dev/null) &

node --env-file-if-exists=.env server.js
