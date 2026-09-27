#!/bin/bash
echo ""
echo "  ============================================"
echo "   Orçamentos"
echo "  ============================================"
echo ""

if ! command -v node &> /dev/null; then
    echo "  ERRO: Node.js não encontrado."
    echo "  Instale em: https://nodejs.org"
    exit 1
fi

echo "  Iniciando servidor em http://localhost:3333"
echo "  Para parar: Ctrl+C"
echo ""

(sleep 2 && open "http://localhost:3333" 2>/dev/null || xdg-open "http://localhost:3333" 2>/dev/null) &

node "$(dirname "$0")/server.js"
