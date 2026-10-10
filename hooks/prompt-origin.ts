/** prompt.submit 의 origin 으로 사용자가 직접 보낸 요청인지 판단 */

/** 사람이 직접 보낸 요청의 origin, 터미널 입력, 원격 연결, SDK 사용자 메시지 */
const USER_ORIGINS: readonly string[] = ['composer', 'bridge', 'sdk']

/** 사용자가 직접 보낸 요청인지 여부, 작업 완료 알림이나 다른 세션, 예약 실행은 제외 */
export function isUserRequest(originKind: string): boolean {
  return USER_ORIGINS.includes(originKind)
}
