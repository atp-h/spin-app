import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import axios from 'axios';
import BeerpongScoreboard from '../components/BeerpongScoreboard';
import { AppContext } from '../hooks';
import { createTestServer } from '../testServer';

jest.mock('axios');

afterEach(() => jest.restoreAllMocks());

const FOUR = [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cas' }, { name: 'Dirk' }];

const renderBeerpong = async (options = {}, contextOverrides = {}) => {
  const server = createTestServer(options);
  server.install(axios);
  const notify = jest.fn();
  const context = { notify, withPin: (action) => action(), ensurePin: async () => true, version: null, soundOn: false, ...contextOverrides };
  const utils = render(
    <AppContext.Provider value={context}>
      <BeerpongScoreboard />
    </AppContext.Provider>
  );
  await screen.findByRole('tab', { name: /Spelen/ });
  await waitFor(() => expect(screen.getByRole('tab', { name: /Spelers/ })).toHaveTextContent(String(server.db.players.filter(p => p.is_present).length)));
  return { server, notify, ...utils };
};

const enterScore = (container, a, b) => {
  const [inputA, inputB] = within(container).getAllByRole('spinbutton');
  fireEvent.change(inputA, { target: { value: String(a) } });
  fireEvent.change(inputB, { target: { value: String(b) } });
};

test('players: add with a random emoji, toggle presence, change avatar', async () => {
  const { server } = await renderBeerpong({ players: [{ name: 'Ann' }] });
  fireEvent.click(screen.getByRole('tab', { name: /Spelers/ }));
  fireEvent.change(screen.getByPlaceholderText('Player name...'), { target: { value: 'Bob' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await screen.findByText('Bob');
  expect(server.db.players.find(p => p.name === 'Bob').emoji).toBeTruthy();

  fireEvent.click(screen.getByLabelText('Ann aanwezig'));
  await waitFor(() => expect(server.db.players[0].is_present).toBe(0));

  fireEvent.click(screen.getByRole('button', { name: 'Avatar van Ann' }));
  fireEvent.click(within(screen.getByRole('listbox')).getByText('🐸'));
  await waitFor(() => expect(server.db.players[0].emoji).toBe('🐸'));
});

test('players: a new evening asks for confirmation and resets presence', async () => {
  const { server } = await renderBeerpong({ players: FOUR });
  fireEvent.click(screen.getByRole('tab', { name: /Spelers/ }));
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: /Nieuwe avond/ }));
  await screen.findByText(/Avond 2/);
  expect(server.db.players.every(p => p.is_present === 0)).toBe(true);
});

test('quick match: pick four, start, enter score, saved', async () => {
  const { server, notify } = await renderBeerpong({ players: FOUR });
  const selects = screen.getAllByRole('combobox');
  ['1', '2', '3', '4'].forEach((id, i) => fireEvent.change(screen.getAllByRole('combobox')[i], { target: { value: id } }));
  expect(selects).toHaveLength(4);
  fireEvent.click(screen.getByRole('button', { name: 'Start Match' }));
  const vs = await screen.findByText('VS');
  enterScore(vs.closest('.draw-result'), 10, 6);
  fireEvent.click(screen.getByRole('button', { name: 'Save & Finish' }));
  await waitFor(() => expect(server.db.matches).toHaveLength(1));
  expect(server.db.teams.map(t => t.name)).toEqual(['Ann & Bob', 'Cas & Dirk']);
  expect(notify).toHaveBeenCalledWith('🏆 Ann & Bob wint!', 'success');
});

test('quick match: chosen players disappear from the other dropdowns', async () => {
  await renderBeerpong({ players: FOUR });
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '1' } });
  expect(within(screen.getAllByRole('combobox')[1]).queryByText('Ann')).not.toBeInTheDocument();
});

test('spin for teams: the wheel draws four distinct present players', async () => {
  await renderBeerpong({ players: [...FOUR, { name: 'Eva' }, { name: 'Away', is_present: 0 }] });
  // Fake setTimeout for the pauses between spins, but drive animation frames by hand
  jest.useFakeTimers({ doNotFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  let cb = null;
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { cb = fn; return 1; });
  jest.spyOn(performance, 'now').mockReturnValue(0);

  fireEvent.click(screen.getByRole('button', { name: /Spin de teams/ }));
  fireEvent.click(screen.getByRole('button', { name: /Start de trekking/ }));
  for (let draw = 0; draw < 4; draw++) {
    await act(async () => { jest.advanceTimersByTime(800); });
    act(() => cb(5000));
  }
  jest.useRealTimers();
  fireEvent.click(await screen.findByRole('button', { name: /Deze teams/ }));

  const values = screen.getAllByRole('combobox').map(s => s.value);
  expect(new Set(values).size).toBe(4);
  expect(values).not.toContain('6');
  expect(screen.getByRole('button', { name: 'Start Match' })).toBeEnabled();
});

test('winner stays on: draw duos, winner keeps the table, loser to the back', async () => {
  const { server } = await renderBeerpong({ players: [...FOUR, { name: 'Eva' }, { name: 'Finn' }] });
  fireEvent.click(screen.getByRole('button', { name: /Winnaar blijft/ }));
  fireEvent.click(screen.getByRole('button', { name: /Loot duo's uit de 6 vrije spelers/ }));
  await waitFor(() => expect(server.db.state.queue?.order).toHaveLength(3));
  const [first, second, third] = server.db.state.queue.order;

  const table = (await screen.findByText(/Aan tafel/)).closest('.table-card');
  enterScore(table, 3, 10);
  fireEvent.click(within(table).getByRole('button', { name: 'Uitslag opslaan' }));
  await waitFor(() => expect(server.db.state.queue.order).toEqual([second, third, first]));
  expect(server.db.state.queue.streak).toBe(1);
});

test('tournament: four players make two duos, two results crown a champion', async () => {
  const { server } = await renderBeerpong({ players: FOUR });
  fireEvent.click(screen.getByRole('button', { name: /Toernooi/ }));
  fireEvent.click(screen.getByRole('button', { name: /Start toernooi/ }));
  await screen.findByText('Finale');
  expect(server.db.state.tournament.rounds.map(r => r.length)).toEqual([1]);

  fireEvent.click(screen.getByRole('button', { name: 'Uitslag invoeren' }));
  const match = document.querySelector('.bracket-match.playable');
  enterScore(match, 10, 7);
  fireEvent.click(within(match).getByRole('button', { name: 'Opslaan' }));
  expect(await screen.findByText('Kampioen')).toBeInTheDocument();
  expect(server.db.matches).toHaveLength(1);
  expect(server.db.state.tournament.champion).toBe(server.db.matches[0].winner_id);
});

test('standings and history after a match; ties cannot be saved', async () => {
  await renderBeerpong({ players: FOUR });
  ['1', '2', '3', '4'].forEach((id, i) => fireEvent.change(screen.getAllByRole('combobox')[i], { target: { value: id } }));
  fireEvent.click(screen.getByRole('button', { name: 'Start Match' }));
  const box = (await screen.findByText('VS')).closest('.draw-result');
  enterScore(box, 5, 5);
  expect(screen.getByText('Gelijkspel is niet mogelijk')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save & Finish' })).toBeDisabled();
  enterScore(box, 10, 5);
  fireEvent.click(screen.getByRole('button', { name: 'Save & Finish' }));
  await waitFor(() => expect(screen.queryByText('VS')).not.toBeInTheDocument());

  fireEvent.click(screen.getByRole('tab', { name: /Stand/ }));
  const rows = document.querySelectorAll('.standing-row');
  expect(rows).toHaveLength(4);
  expect(rows[0]).toHaveTextContent('🥇');

  fireEvent.click(screen.getByRole('tab', { name: /Historie/ }));
  expect(screen.getByText(/Avond 1/)).toBeInTheDocument();
  expect(document.querySelectorAll('.match-card')).toHaveLength(1);
});
