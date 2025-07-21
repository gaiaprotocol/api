import { getAddress } from 'viem'
import { isHolder } from './nft'

const GOD_NFT_CONTRACT = '0x134590ACB661Da2B318BcdE6b39eF5cF8208E372'

const WHITELIST = [
  '0xa9a6D8C0ACc5266CC5Db2c3FE2EF799A10d9ceA8',
  '0x67aaB54e9F81d35B2d9Ad7Bc3b6505095618aeB0',
  '0x7a2bBEc3a4064d43A691A5809fAC81547f3Fa202',
  '0x5223595e40ACeAaC6F829b4aa79D9ef430758E09',
  '0x80A594e6555D04D718Ac565358daB8eA76D0eEe5',
]

export async function checkGodMode(address: string): Promise<boolean> {
  const normalized = getAddress(address)
  const holder = await isHolder(normalized, GOD_NFT_CONTRACT)
  return holder || WHITELIST.includes(normalized)
}
