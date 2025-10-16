declare module 'base-64' {
  /** 蜈･蜉帙・ UTF-16 譁・ｭ怜・縲∬ｿ斐ｊ蛟､縺ｯ Base64 譁・ｭ怜・ */
  export function encode(input: string): string;
  /** 蜈･蜉帙・ Base64 譁・ｭ怜・縲∬ｿ斐ｊ蛟､縺ｯ UTF-16 譁・ｭ怜・ */
  export function decode(input: string): string;

  const _default: {
    encode: typeof encode;
    decode: typeof decode;
  };
  export default _default;
}
