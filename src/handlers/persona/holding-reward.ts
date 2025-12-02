// src/handlers/holding-reward.ts
import { jsonWithCors } from '@gaiaprotocol/worker-common';
import {
  createPublicClient,
  encodeAbiParameters,
  Hex,
  http,
  keccak256,
  parseAbiParameters,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { z } from 'zod';

// PersonaFragments 컨트랙트에서 사용하는 nonces(address) 뷰 함수 ABI
const PERSONA_FRAGMENTS_ABI = [
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Solidity 쪽과 동일해야 하는 해시 스키마 (예시)
//
// bytes32 messageHash = keccak256(
//   abi.encode(
//     persona,      // address
//     trader,       // address
//     amount,       // uint256
//     rewardRatio,  // uint256 (1e18 기준 비율)
//     nonce         // uint256
//   )
// );
//
// bytes32 ethSignedMessageHash = ECDSA.toEthSignedMessageHash(messageHash);
//
// recover(ethSignedMessageHash, signature) == signer;
//
// 컨트랙트 구현과 반드시 맞춰야 한다는 점 유의 ⚠️
const HOLDING_REWARD_ENCODE_TYPES = parseAbiParameters(
  'address persona, address trader, uint256 amount, uint256 rewardRatio, uint256 nonce',
);

// side 값은 현재 서명 데이터에는 포함하지 않았지만,
// 필요하다면 위 인자 목록에 함께 넣고 컨트랙트도 맞추면 됩니다.
const querySchema = z.object({
  persona: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid persona address'),
  trader: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid trader address'),
  amount: z
    .string()
    .min(1, 'amount is required')
    .refine(
      (v) => {
        try {
          // eslint-disable-next-line no-new
          BigInt(v);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'amount must be a bigint string' },
    ),
  side: z.enum(['buy', 'sell']),
});

type HoldingRewardSide = 'buy' | 'sell';

export async function handlePersonaHoldingReward(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);

    const parsed = querySchema.safeParse({
      persona: url.searchParams.get('persona'),
      trader: url.searchParams.get('trader'),
      amount: url.searchParams.get('amount'),
      side: url.searchParams.get('side'),
    });

    if (!parsed.success) {
      return jsonWithCors(
        {
          ok: false,
          error: parsed.error.errors.map((e) => e.message).join(', '),
        },
        400,
      );
    }

    const { persona, trader, amount, side } = parsed.data;

    const amountBigInt = BigInt(amount);

    // ===== 체인 & 컨트랙트 설정 =====
    // 이미 Env 타입에 정의되어 있다고 가정하고 사용합니다.
    // (실제 env 이름은 프로젝트 상황에 맞게 조정해 주세요)
    //
    // 예시:
    // - env.PERSONA_FRAGMENTS_ADDRESS
    // - env.HOLDING_VERIFIER_PRIVATE_KEY
    const chain = env.ENV_TYPE === 'prod' ? base : baseSepolia;
    const personaFragmentsAddress = env.PERSONA_FRAGMENTS_ADDRESS as `0x${string}`;
    const signerKey = env.HOLDING_VERIFIER_PRIVATE_KEY as `0x${string}`;
    const defaultRewardRatioStr = '0';

    if (!personaFragmentsAddress || !signerKey) {
      return jsonWithCors(
        {
          ok: false,
          error:
            'Missing chain or signer configuration in environment variables.',
        },
        500,
      );
    }

    let rewardRatio: bigint;
    try {
      rewardRatio = BigInt(defaultRewardRatioStr);
    } catch {
      return jsonWithCors(
        {
          ok: false,
          error: 'Invalid DEFAULT_HOLDING_REWARD_RATIO in env',
        },
        500,
      );
    }

    // side 에 따라 보상 비율을 다르게 주고 싶다면 여기서 분기
    // (예: buy 에만 리워드, sell 은 0 등)
    const _side: HoldingRewardSide = side;
    if (_side === 'sell') {
      // 예시: 판매 때는 리워드 0
      // rewardRatio = 0n;
      // 필요 없다면 주석 유지 또는 삭제
    }

    // ===== public client 생성 =====
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    // ===== on-chain nonces(trader) 조회 =====
    const nonce = (await publicClient.readContract({
      address: personaFragmentsAddress,
      abi: PERSONA_FRAGMENTS_ABI,
      functionName: 'nonces',
      args: [trader as `0x${string}`],
    })) as bigint;

    // ===== 서명자 계정 생성 =====
    const signerAccount = privateKeyToAccount(signerKey as Hex);

    // ===== message hash 생성 (컨트랙트와 동일한 형식) =====
    const encoded = encodeAbiParameters(HOLDING_REWARD_ENCODE_TYPES, [
      persona as `0x${string}`,
      trader as `0x${string}`,
      amountBigInt,
      rewardRatio,
      nonce,
    ]);

    const messageHash = keccak256(encoded);

    // EIP-191 스타일 서명 (Solidity: ECDSA.toEthSignedMessageHash 기준)
    const signature = await signerAccount.signMessage({
      message: { raw: messageHash },
    });

    return jsonWithCors(
      {
        ok: true,
        rewardRatio: rewardRatio.toString(),
        nonce: nonce.toString(),
        signature: signature as `0x${string}`,
      },
      200,
    );
  } catch (err: any) {
    console.error('[handleHoldingReward] unexpected error', err);
    const message = err?.message || 'Internal server error.';
    return jsonWithCors({ ok: false, error: message }, 500);
  }
}
