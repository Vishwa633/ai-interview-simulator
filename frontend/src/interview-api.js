export function readCvPdf(file) {
  if (!file?.name) return undefined
  if (!/\.pdf$/i.test(file.name) || !file.size) throw new Error('Choose a valid PDF for your CV.')
  if (file.size > 4 * 1024 * 1024) throw new Error('Choose a CV PDF that is 4 MB or smaller.')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the CV file. Choose it again.'))
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.readAsDataURL(file)
  })
}

export async function requestInterview(action, data, accessToken, signal) {
  let response
  try {
    response = await fetch(`/api/interviews${action}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, ...(data !== undefined && { 'Content-Type': 'application/json' }) },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal,
    })
  } catch {
    throw new Error('Could not reach the practice service. Please try again.')
  }
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(result?.detail || 'The practice request failed. Please try again.')
    error.record = result?.record
    throw error
  }
  return result
}
