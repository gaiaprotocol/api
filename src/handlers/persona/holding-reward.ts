import { jsonWithCors } from '@gaiaprotocol/worker-common';
import {
  createPublicClient,
  encodePacked,
  Hex,
  http,
  keccak256,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { z } from 'zod';

// PersonaFragments (또는 HoldingRewardsBase 상속 컨트랙트) 에서 사용하는 nonces(address) 뷰 함수 ABI
const NONCES_ABI = [
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

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

export async function handlePersonaHoldingReward(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const url = new URL(request.url);

    // ===== 1. 쿼리 파라미터 검증 =====
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
    const amountBigInt = BigInt(amount); // 현재 해시에는 포함하지 않지만, 필요하면 응답 등에 활용 가능

    // ===== 2. 체인 & 컨트랙트 설정 =====
    const chain = env.ENV_TYPE === 'prod' ? base : baseSepolia;

    // HoldingRewardsBase 를 상속한 컨트랙트 주소
    // (PersonaFragments 컨트랙트가 그대로 상속하고 있다면 같은 주소 사용)
    const holdingRewardsAddress = env.PERSONA_FRAGMENTS_ADDRESS as `0x${string}`;
    const signerKey = env.HOLDING_VERIFIER_PRIVATE_KEY as `0x${string}`;

    if (!holdingRewardsAddress || !signerKey) {
      return jsonWithCors(
        {
          ok: false,
          error:
            'Missing holding rewards contract address or signer private key in environment variables.',
        },
        500,
      );
    }

    //TODO: 리워드 비율 (1e18 = 100%), 추후 보유한 자산 수량을 바탕으로 계산하도록 수정하기
    const rewardRatio = parseEther('0');

    // side 에 따라 비율을 다르게 주고 싶으면 여기에서 분기
    const _side: HoldingRewardSide = side;
    if (_side === 'sell') {
      // 예시: sell 에서는 리워드 0
      // rewardRatio = 0n;
    }

    // ===== 3. public client 생성 =====
    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    // ===== 4. on-chain nonces(trader) 조회 =====
    // Solidity: mapping(address => uint256) public nonces;
    const nonce = (await publicClient.readContract({
      address: holdingRewardsAddress,
      abi: NONCES_ABI,
      functionName: 'nonces',
      args: [trader as `0x${string}`],
    })) as bigint;

    // ===== 5. 서명자 계정 생성 (holdingVerifier) =====
    const signerAccount = privateKeyToAccount(signerKey as Hex);

    // ===== 6. Solidity와 완전히 동일한 해시 생성 =====
    //
    // Solidity 쪽:
    //
    // bytes32 hash = keccak256(
    //   abi.encodePacked(
    //     address(this),
    //     block.chainid,
    //     msg.sender,
    //     rewardRatio,
    //     nonce
    //   )
    // );
    //
    // bytes32 ethSignedHash = ECDSA.toEthSignedMessageHash(hash);
    // recover(ethSignedHash, signature) == holdingVerifier;
    //
    // 여기서 msg.sender 는 실제로 calculateHoldingReward 를 호출하는 trader 라고 가정합니다.
    //
    const chainId = BigInt(chain.id);

    const packed = encodePacked(
      ['address', 'uint256', 'address', 'uint256', 'uint256'],
      [
        holdingRewardsAddress,        // address(this)
        chainId,                      // block.chainid
        trader as `0x${string}`,      // msg.sender (프론트에서 이 주소로 트랜잭션 보내야 함)
        rewardRatio,                  // uint256
        nonce,                        // uint256
      ],
    );

    const messageHash = keccak256(packed);

    // viem 의 signMessage({ message: { raw } }) 는
    // ECDSA.toEthSignedMessageHash(hash) 와 동일한 EIP-191 prefix 를 적용합니다.
    const signature = await signerAccount.signMessage({
      message: { raw: messageHash },
    });

    // ===== 7. 응답 반환 =====
    return jsonWithCors(
      {
        ok: true,
        persona,
        trader,
        amount: amountBigInt.toString(),
        rewardRatio: rewardRatio.toString(),
        nonce: nonce.toString(),
        signature: signature as `0x${string}`,
      },
      200,
    );
  } catch (err: any) {
    console.error('[handlePersonaHoldingReward] unexpected error', err);
    const message = err?.message || 'Internal server error.';
    return jsonWithCors({ ok: false, error: message }, 500);
  }
}
