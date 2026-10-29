import React from 'react';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import axios from 'axios';
import App from '../App';
import { createTestServer } from '../testServer';

jest.mock('axios');

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

const setup = (options) => {
  const server = createTestServer(options);
  server.install(axios);
  return server;
};

let frame = null;

const spinToEnd = async () => {
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { frame = fn; return 1; });
  jest.spyOn(performance, 'now').mockReturnValue(0);
  fireEvent.click(screen.getByRole('button', { name: 'Spin the wheel' }));
  act(() => frame(10000));
  return screen.findByRole('dialog', { name: 'Winner' });
};

test('navigation: wheel and beerpong tabs, help opens in a modal', async () => {
  setup({ wheels: [{ name: 'Lunch', items: ['a', 'b'] }] });
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Lunch' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Beerpong/ }));
  expect(await screen.findByRole('tab', { name: /Spelen/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Handleiding' }));
  const help = screen.getByRole('dialog', { name: /Handleiding/ });
  expect(within(help).getByText(/Afvalrace:/)).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: /Handleiding/ })).not.toBeInTheDocument();
});

test('wheel chips: create a wheel, which opens the item editor', async () => {
  const server = setup({ wheels: [{ name: 'Lunch', items: ['a'] }] });
  render(<App />);
  await screen.findByRole('heading', { name: 'Lunch' });
  fireEvent.click(screen.getByRole('button', { name: /Nieuw rad/ }));
  fireEvent.change(screen.getByPlaceholderText('New wheel name...'), { target: { value: 'Drinks' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  expect(await screen.findByRole('heading', { name: 'Drinks' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Drinks/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByPlaceholderText('Add new item...')).toBeInTheDocument();
  expect(server.db.wheels[0].name).toBe('Drinks');
});

test('items: paste a list, give one extra weight; saved weight-1 items stay plain strings', async () => {
  const server = setup({ wheels: [{ name: 'Lunch', items: [] }] });
  render(<App />);
  await screen.findByRole('heading', { name: 'Lunch' });
  fireEvent.click(screen.getByRole('button', { name: /Lijst plakken/ }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Pizza\n\n Sushi \nTacos' } });
  fireEvent.click(screen.getByRole('button', { name: '3 toevoegen' }));
  await waitFor(() => expect(server.db.wheels[0].items).toEqual(['Pizza', 'Sushi', 'Tacos']));

  fireEvent.click(screen.getAllByRole('button', { name: 'Gewicht 1' })[1]);
  await waitFor(() => expect(server.db.wheels[0].items).toEqual(['Pizza', { label: 'Sushi', weight: 2 }, 'Tacos']));
});

test('items: fill the wheel with present players', async () => {
  const server = setup({
    wheels: [{ name: 'Wie haalt bier?', items: [] }],
    players: [{ name: 'Ann', emoji: '🦄' }, { name: 'Bob' }, { name: 'Cas', is_present: 0 }]
  });
  render(<App />);
  await screen.findByRole('heading', { name: 'Wie haalt bier?' });
  fireEvent.click(screen.getByRole('button', { name: /Aanwezige spelers/ }));
  await waitFor(() => expect(server.db.wheels[0].items).toEqual(['🦄 Ann', 'Bob']));
});

test('elimination mode: the winner leaves the wheel when the result is closed', async () => {
  setup({ wheels: [{ name: 'Raffle', items: ['a', 'b', 'c'] }] });
  render(<App />);
  await screen.findByRole('heading', { name: 'Raffle' });
  fireEvent.click(screen.getByLabelText('Afvalrace'));
  fireEvent.click(screen.getByRole('button', { name: /Items/ }));
  expect(screen.getByText('3/3 over')).toBeInTheDocument();

  const dialog = await spinToEnd();
  expect(within(dialog).getByText('gaat van het rad af')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  expect(screen.getByText('2/3 over')).toBeInTheDocument();
  expect(document.querySelectorAll('.item.eliminated')).toHaveLength(1);

  fireEvent.click(screen.getByRole('button', { name: /reset/ }));
  expect(screen.getByText('3/3 over')).toBeInTheDocument();
});

test('delete: hidden at once, undo brings it back, otherwise deleted after the PIN', async () => {
  const server = setup({ pin: '4321', wheels: [{ name: 'Keep', items: ['a'] }, { name: 'Gone', items: ['b'] }] });
  render(<App />);
  await screen.findByRole('heading', { name: 'Keep' });

  // Undo
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  const pin = await screen.findByLabelText('Wachtwoord');
  fireEvent.change(pin, { target: { value: '4321' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ontgrendel' }));
  await screen.findByText('"Keep" verwijderd');
  expect(screen.queryByRole('tab', { name: /Keep/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ongedaan maken' }));
  expect(await screen.findByRole('tab', { name: /Keep/ })).toBeInTheDocument();
  expect(server.db.wheels).toHaveLength(2);

  // Real delete after the undo window (PIN is remembered now)
  jest.useFakeTimers();
  fireEvent.click(screen.getByRole('tab', { name: /Gone/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  await act(async () => { await Promise.resolve(); });
  await act(async () => { jest.advanceTimersByTime(6500); });
  jest.useRealTimers();
  await waitFor(() => expect(server.db.wheels.map(w => w.name)).toEqual(['Keep']));
});

test('a wrong PIN is rejected and nothing is deleted', async () => {
  const server = setup({ pin: '4321', wheels: [{ name: 'Keep', items: ['a'] }] });
  render(<App />);
  await screen.findByRole('heading', { name: 'Keep' });
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  fireEvent.change(await screen.findByLabelText('Wachtwoord'), { target: { value: '0000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ontgrendel' }));
  expect(await screen.findByText(/Onjuist of ontbrekend wachtwoord/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sluiten' }));
  expect(screen.getByRole('heading', { name: 'Keep' })).toBeInTheDocument();
  expect(server.db.wheels).toHaveLength(1);
});

test('duplicate a wheel', async () => {
  const server = setup({ wheels: [{ name: 'Lunch', items: ['a', 'b'] }] });
  render(<App />);
  await screen.findByRole('heading', { name: 'Lunch' });
  fireEvent.click(screen.getByRole('button', { name: 'Kopieer rad' }));
  expect(await screen.findByRole('heading', { name: 'Lunch (kopie)' })).toBeInTheDocument();
  expect(server.db.wheels[0].items).toEqual(['a', 'b']);
});

test('party mode shows only the big wheel and closes again', async () => {
  setup({ wheels: [{ name: 'Lunch', items: ['a', 'b'] }] });
  render(<App />);
  await screen.findByRole('heading', { name: 'Lunch' });
  fireEvent.click(screen.getByRole('button', { name: /Party mode/ }));
  expect(document.querySelector('.party-mode')).toBeInTheDocument();
  expect(screen.queryByText('Items')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Party mode sluiten' }));
  expect(document.querySelector('.party-mode')).not.toBeInTheDocument();
});

test('live updates: a change on another phone shows up after the next poll', async () => {
  jest.useFakeTimers();
  const server = setup({ wheels: [{ name: 'Lunch', items: ['a'] }] });
  render(<App />);
  await act(async () => { jest.advanceTimersByTime(10); });
  await screen.findByRole('heading', { name: 'Lunch' });

  // Someone else adds a wheel
  server.db.wheels.unshift({ id: 55, name: 'From another phone', items: [] });
  server.db.version++;
  await act(async () => { jest.advanceTimersByTime(4100); });
  await act(async () => { await Promise.resolve(); });
  expect(await screen.findByRole('tab', { name: /From another phone/ })).toBeInTheDocument();
});

test('spin result is saved and Spin again starts another spin', async () => {
  const server = setup({ wheels: [{ name: 'Lunch', items: ['a', 'b'] }] });
  render(<App />);
  await screen.findByRole('heading', { name: 'Lunch' });
  const dialog = await spinToEnd();
  await waitFor(() => expect(server.db.spins).toHaveLength(1));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Spin again' }));
  // Spin again waits one animation frame before starting
  act(() => frame(0));
  expect(screen.getByRole('button', { name: 'Wheel is spinning' })).toBeInTheDocument();
});

test('deleting a player asks for the password; wrong password keeps the player', async () => {
  const server = setup({ pin: 'geheim', players: [{ name: 'Ann' }, { name: 'Bob' }] });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Beerpong/ }));
  fireEvent.click(await screen.findByRole('tab', { name: /Spelers/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Ann verwijderen' }));

  const input = await screen.findByLabelText('Wachtwoord');
  fireEvent.change(input, { target: { value: 'fout' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ontgrendel' }));
  expect(await screen.findByText(/Onjuist of ontbrekend wachtwoord/)).toBeInTheDocument();
  expect(server.db.players.map(p => p.name)).toEqual(['Ann', 'Bob']);

  fireEvent.change(screen.getByLabelText('Wachtwoord'), { target: { value: 'geheim' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ontgrendel' }));
  await waitFor(() => expect(server.db.players.map(p => p.name)).toEqual(['Bob']));
});
