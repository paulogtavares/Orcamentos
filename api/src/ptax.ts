/** Cotação PTAX de venda do dólar (Banco Central), buscada pelo servidor como na v1.2.1. */
export async function buscarPtax(): Promise<{ usd: number; dataCotacao: string }> {
  for (let atras = 0; atras < 7; atras++) {
    const d = new Date(Date.now() - atras * 864e5);
    const mmddaaaa = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${d.getFullYear()}`;
    const url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${mmddaaaa}'&$format=json`;
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`BCB respondeu ${r.status}`);
    const dados: any = await r.json().catch(() => {
      throw new Error("Resposta inválida do BCB");
    });
    const v = dados?.value?.[0];
    if (v?.cotacaoVenda) return { usd: Number(v.cotacaoVenda), dataCotacao: v.dataHoraCotacao };
  }
  throw new Error("PTAX não encontrada nos últimos 7 dias");
}
