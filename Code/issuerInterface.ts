export interface IIssuer {
    store_id: string
    confirmed_connections: Record<string, { did: string, confirmed_at: number }>

    start_server(): void
    stop_server(): void
    create_offer(preauth_code: string): Promise<string>
    send_didcomm_msg(to: string, from: string, type: string, body: Object, thid?: string): Promise<string>
}