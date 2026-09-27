/**
 * Pronto quando: "um db.json real da v1.2.1 importado mostra os mesmos valores de setup,
 * mensalidade, TCV e margem em todos os orçamentos". O db.json é gerado pelo servidor da v1.2.1.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { calcular, resumo } from "@orcamentos/compartilhado/calc";
import { createRequire } from "node:module";
import { exportarBase, importarBase, validarBase } from "../src/dados/importador.js";
import { bancoVazio } from "./apoio.js";
import { popularV1, servidorV1 } from "./v1.js";

const Legado = createRequire(import.meta.url)("../../legado/calc.js");
let dbJson: any;

beforeAll(async () => {
  const v1 = await servidorV1(3997);
  try {
    await popularV1(v1);
    dbJson = v1.lerDb();
  } finally {
    v1.parar();
  }
}, 60_000);

describe("importação de um db.json da v1.2.1", () => {
  it("o banco devolve exatamente o db.json (backup = entrada) e os valores batem com o calc.js original", async () => {
    expect(dbJson.orcamentos.length).toBe(5);
    const c = await bancoVazio();
    try {
      await c.banco.tx(null, (t) => importarBase(t.query, validarBase(dbJson)));
      const saida = await exportarBase(c.banco.query);
      expect(saida).toEqual(dbJson);
      for (const o of saida.orcamentos) {
        const orig = dbJson.orcamentos.find((x: any) => x.id === o.id);
        expect(resumo(o)).toEqual(Legado.resumo(orig));
        expect(resumo(o)).toEqual(orig.resumo);
        const a = calcular(o),
          b = Legado.calcular(orig);
        expect([a.setup, a.mensal, a.tcv, a.margemReal]).toEqual([b.setup, b.mensal, b.tcv, b.margemReal]);
      }
      // reimportar não duplica
      await c.banco.tx(null, (t) => importarBase(t.query, validarBase(dbJson)));
      expect(await exportarBase(c.banco.query)).toEqual(dbJson);
    } finally {
      await c.fechar();
    }
  });
});
