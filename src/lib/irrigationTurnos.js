export const PORTION_LABELS = { '': 'Completo', N: 'Norte', S: 'Sur', E: 'Este', O: 'Oeste' };
export const factorOf = portion => (portion ? 0.5 : 1);

export const WELL_TURNOS = {
  'Glonet 1': [
    { value: 'T1', lots: [{ lot: 'C1', portion: '' }, { lot: 'C3', portion: 'S' }, { lot: 'C5', portion: 'S' }, { lot: 'C7', portion: 'S' }] },
    { value: 'T2', lots: [{ lot: 'C3', portion: 'N' }, { lot: 'C5', portion: 'N' }, { lot: 'C7', portion: 'N' }, { lot: 'C4', portion: 'S' }, { lot: 'C6', portion: 'S' }, { lot: 'C8', portion: 'S' }] },
    { value: 'T3', lots: [{ lot: 'C2', portion: '' }, { lot: 'C4', portion: 'N' }, { lot: 'C6', portion: 'N' }, { lot: 'C8', portion: 'N' }] },
  ],
  'Glonet 2': [
    { value: 'T4', lots: [{ lot: 'C9', portion: 'S' }, { lot: 'C11', portion: 'S' }, { lot: 'C13', portion: 'S' }, { lot: 'C15', portion: '' }] },
    { value: 'T5', lots: [{ lot: 'C9', portion: 'N' }, { lot: 'C11', portion: 'N' }, { lot: 'C13', portion: 'N' }, { lot: 'C12', portion: 'S' }, { lot: 'C14', portion: 'S' }] },
    { value: 'T6', lots: [{ lot: 'C12', portion: 'N' }, { lot: 'C14', portion: 'N' }, { lot: 'C16', portion: '' }] },
  ],
  'Pozo 1': [
    { value: 'T1', lots: [{ lot: 'C3', portion: 'O' }, { lot: 'C3', portion: 'E' }, { lot: 'C4', portion: 'O' }, { lot: 'C4', portion: 'E' }, { lot: 'Int C 3', portion: '' }] },
    { value: 'T2', lots: [{ lot: 'P3', portion: 'O' }, { lot: 'P3', portion: 'E' }, { lot: 'P4', portion: 'O' }, { lot: 'P4', portion: 'E' }, { lot: 'Int C 4', portion: '' }] },
    { value: 'T3', lots: [{ lot: 'P1', portion: 'O' }, { lot: 'P1', portion: 'E' }, { lot: 'P2', portion: 'O' }, { lot: 'P2', portion: 'E' }, { lot: 'Int C 2', portion: '' }] },
  ],
  'Pozo 2': [
    { value: 'T1', lots: [{ lot: 'Op1 NO', portion: '' }, { lot: 'Op1 NE', portion: '' }, { lot: 'Op2 NO', portion: '' }] },
    { value: 'T2', lots: [{ lot: 'Op1 SO', portion: '' }, { lot: 'Op1 SE', portion: '' }, { lot: 'Op2 SO', portion: '' }] },
  ],
  'Pozo 3': [
    { value: 'T1', lots: [{ lot: 'H3', portion: 'O' }, { lot: 'H3', portion: 'E' }, { lot: 'H4', portion: 'O' }, { lot: 'H4', portion: 'E' }, { lot: 'Int A 4', portion: '' }] },
    { value: 'T2', lots: [{ lot: 'B3', portion: 'O' }, { lot: 'B3', portion: 'E' }, { lot: 'B4', portion: 'O' }, { lot: 'B4', portion: 'E' }, { lot: 'Int A 3', portion: '' }] },
    { value: 'T3', lots: [{ lot: 'Int BS', portion: '' }] },
  ],
  'Pozo 4': [
    { value: 'T1', lots: [{ lot: 'H1', portion: 'O' }, { lot: 'H1', portion: 'E' }, { lot: 'H2', portion: 'O' }, { lot: 'H2', portion: 'E' }, { lot: 'Int A 2', portion: '' }] },
    { value: 'T2', lots: [{ lot: 'B1', portion: 'O' }, { lot: 'B1', portion: 'E' }, { lot: 'B2', portion: 'O' }, { lot: 'B2', portion: 'E' }, { lot: 'Int A 1', portion: '' }] },
    { value: 'T3', lots: [{ lot: 'C1', portion: 'O' }, { lot: 'C1', portion: 'E' }, { lot: 'C2', portion: 'O' }, { lot: 'C2', portion: 'E' }, { lot: 'Int C 1', portion: '' }] },
  ],
  'Pozo 5': [
    { value: 'T3', lots: [{ lot: 'Op2 NE', portion: '' }, { lot: 'Op3 NO', portion: '' }, { lot: 'Op3 NE', portion: '' }] },
    { value: 'T4', lots: [{ lot: 'Op2 SE', portion: '' }, { lot: 'Op3 SO', portion: '' }, { lot: 'Op3 SE', portion: '' }] },
  ],
  'Pozo 6': [
    { value: 'T1', lots: [{ lot: 'Int BC', portion: '' }] },
    { value: 'T2', lots: [{ lot: 'Int BN', portion: '' }] },
    { value: 'T3', lots: [{ lot: 'Arbosana', portion: '' }] },
  ],
};