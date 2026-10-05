/** v2.0.0: margem + imposto ≥ 100% (ou imposto ≥ 100% no markup) não é um preço válido. */
import { describe, expect, it } from "vitest";
import { MSG_IMPOSTO, MSG_MARGEM_IMPOSTO, validarPrecificacao } from "./calc.js";

describe("validarPrecificacao", () => {
  it("modo margem: aceita abaixo de 100% e recusa a partir de 100%", () => {
    expect(validarPrecificacao({ modoPreco: "margem", margem: 0.3, imposto: 0.15 })).toBeNull();
    expect(validarPrecificacao({ modoPreco: "margem", margem: 0.69, imposto: 0.3 })).toBeNull();
    expect(validarPrecificacao({ modoPreco: "margem", margem: 0.6, imposto: 0.4 })).toBe(MSG_MARGEM_IMPOSTO);
    expect(validarPrecificacao({ modoPreco: "margem", margem: 0.8, imposto: 0.3 })).toBe(MSG_MARGEM_IMPOSTO);
  });
  it("o caso que originou a decisão (70% + 30%): o cálculo faz 1 − 0,7 − 0,3 = 5,55e-17, não zero; é recusado", () => {
    expect(1 - 0.7 - 0.3).toBeGreaterThan(0);
    expect(validarPrecificacao({ modoPreco: "margem", margem: 0.7, imposto: 0.3 })).toBe(MSG_MARGEM_IMPOSTO);
  });
  it("tolerância: percentuais digitados que somam 100% mas ficam um fio abaixo de 1 também são recusados", () => {
    // a tela divide por 100: 0,15% + 99,85% vira 0,9999999999999999 (há 780 casos assim com duas casas decimais)
    const margem = 0.15 / 100;
    const imposto = 99.85 / 100;
    expect(margem + imposto).toBeLessThan(1);
    expect(validarPrecificacao({ modoPreco: "margem", margem, imposto })).toBe(MSG_MARGEM_IMPOSTO);
    let passariam = 0;
    for (let a = 0; a <= 10000; a++)
      if (validarPrecificacao({ modoPreco: "margem", margem: a / 10000, imposto: (10000 - a) / 10000 }) === null)
        passariam++;
    expect(passariam).toBe(0);
  });
  it("sem modo informado vale a regra do modo margem (padrão do cálculo)", () => {
    expect(validarPrecificacao({ margem: 0.9, imposto: 0.1 })).toBe(MSG_MARGEM_IMPOSTO);
    expect(validarPrecificacao({})).toBeNull();
  });
  it("modo markup: o markup pode passar de 100%; só o imposto precisa ficar abaixo de 100%", () => {
    expect(validarPrecificacao({ modoPreco: "markup", margem: 1.5, imposto: 0.15 })).toBeNull();
    expect(validarPrecificacao({ modoPreco: "markup", margem: 0.3, imposto: 1 })).toBe(MSG_IMPOSTO);
  });
});
