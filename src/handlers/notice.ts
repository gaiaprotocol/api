import { jsonWithCors } from "@gaiaprotocol/worker-common";
import { fetchNotices } from "../services/notice";

export async function handleNotices(env: Env): Promise<Response> {
  try {
    const notices = await fetchNotices(env);

    return jsonWithCors({
      success: true,
      data: notices
    });
  } catch (err) {
    console.error(err);
    return jsonWithCors({
      success: false,
      error: 'Failed to fetch notices'
    }, 500);
  }
}
