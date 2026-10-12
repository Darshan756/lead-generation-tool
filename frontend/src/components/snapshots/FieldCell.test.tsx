import { render, screen } from '@testing-library/react'
import { FieldCell } from './FieldCell'

describe('FieldCell', () => {
  it('says "Missing" in words when there is no value', () => {
    render(<FieldCell value={null} />)
    expect(screen.getByText('Missing')).toBeInTheDocument()
  })

  it('shows a plain value without an enrichment marker', () => {
    render(<FieldCell value="(619) 555-0101" />)
    expect(screen.getByText('(619) 555-0101')).toBeInTheDocument()
    expect(screen.queryByLabelText(/enrichment|manually/i)).not.toBeInTheDocument()
  })

  it('marks values filled by enrichment and values entered by hand', () => {
    const { rerender } = render(<FieldCell value="info@bravo.example" source="simulated" />)
    expect(screen.getByLabelText('Filled by enrichment')).toBeInTheDocument()
    rerender(<FieldCell value="info@bravo.example" source="manual" />)
    expect(screen.getByLabelText('Entered manually')).toBeInTheDocument()
  })

  it('flags a value that is present but unusable', () => {
    render(<FieldCell value="sales at charlie.example" problem="invalid format" />)
    expect(screen.getByText('(invalid format)')).toBeInTheDocument()
  })
})
