Anthropic TypeScript SDK (@anthropic-ai/sdk) 1.14.0 — 브라우저용 한 파일 묶음.
현장도면의 ‘AI로 평면도 읽기’(설정 → AI 연결)가 쓸 때만 불러옵니다.

다시 만들기:
  npm install @anthropic-ai/sdk@1.14.0 esbuild
  entry.js:
    import Anthropic from '@anthropic-ai/sdk';
    import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
    import { betaJSONSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/beta/json-schema';
    window.AnthropicSDK = { Anthropic, jsonSchemaOutputFormat, betaJSONSchemaOutputFormat };
  npx esbuild entry.js --bundle --format=iife --minify --target=es2020 --legal-comments=none --outfile=anthropic-sdk.min.js

라이선스: LICENSE (이 폴더)
