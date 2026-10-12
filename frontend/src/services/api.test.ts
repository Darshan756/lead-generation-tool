import { ApiError, errorMessage, get } from './api'

describe('errorMessage', () => {
  it('passes through a plain detail string', () => {
    expect(errorMessage(409, { detail: 'A snapshot named "X" already exists.' })).toBe('A snapshot named "X" already exists.')
  })

  it('flattens validation errors into one readable sentence', () => {
    const body = {
      detail: [
        { loc: ['body', 'name'], msg: 'String should have at least 1 character' },
        { loc: ['body'], msg: 'Value error, revenue_min must be less than or equal to revenue_max' },
      ],
    }
    expect(errorMessage(422, body)).toBe(
      'name: String should have at least 1 character; revenue_min must be less than or equal to revenue_max',
    )
  })

  it('falls back to a generic message', () => {
    expect(errorMessage(500, null)).toBe('Request failed (500).')
  })
})

describe('request', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports an unreachable API clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(get('/leads')).rejects.toMatchObject({ status: 0, message: expect.stringContaining('Cannot reach') })
  })

  it('throws an ApiError carrying the server message', async () => {
    const response = new Response(JSON.stringify({ detail: 'Snapshot 9 does not exist.' }), { status: 404 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const error = await get('/snapshots/9').catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('Snapshot 9 does not exist.')
  })
})
