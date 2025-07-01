// Can be used for nicer vscode syntax highlighting & auto formatting
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#raw_strings
//
// Doesn't actually transform the string at all :)
export const html = (strings: readonly string[], ...substitutions: any[]) =>
  String.raw({ raw: strings }, ...substitutions)
export const gql = (strings: readonly string[], ...substitutions: any[]) =>
  String.raw({ raw: strings }, ...substitutions)
