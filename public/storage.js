const account = document.querySelector('meta[name="luma-account"]')?.content;

export function accountKey(key) {
  return account ? `${key}.${account}` : key;
}
