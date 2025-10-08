declare module 'base-64' {
  /** 入力は UTF-16 文字列、返り値は Base64 文字列 */
  export function encode(input: string): string;
  /** 入力は Base64 文字列、返り値は UTF-16 文字列 */
  export function decode(input: string): string;

  const _default: {
    encode: typeof encode;
    decode: typeof decode;
  };
  export default _default;
}
