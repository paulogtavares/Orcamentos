import { configuracaoEslint } from "plataforma-kit/eslint";

export default configuracaoEslint({
  react: ["web/src/**/*.tsx"],
  ignorar: ["legado/**", "dist-pacote/**", "**/public/**", "coverage/**"],
});
