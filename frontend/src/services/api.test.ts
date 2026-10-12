import { ApiError, errorMessage, get, post, upload } from './api'

describe('errorMessage', () => {
  it('passes through a plain detail string', () => {
    expect(errorMessage(409, { detail: 'A lead list named "X" already exists.' })).toBe('A lead list named "X" already exists.')
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
    const response = new Response(JSON.stringify({ detail: 'Lead list 9 does not exist.' }), { status: 404 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const error = await get('/snapshots/9').catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('Lead list 9 does not exist.')
  })
})

describe('upload', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the file as multipart form data and lets the browser set the content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ inserted: 1 }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['a,b'], 'leads.csv')
    await upload('/leads/import', file)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/leads/import')
    expect(init.method).toBe('POST')
    expect((init.body as FormData).get('file')).toBe(file)
    expect(init.headers).toBeUndefined()
  })

  it('still labels JSON bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await post('/snapshots', { name: 'x' })
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toEqual({ 'Content-Type': 'application/json' })
  })
})
