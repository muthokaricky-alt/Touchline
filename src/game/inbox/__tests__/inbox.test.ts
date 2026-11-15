import { addMessages, InboxMessageSchema, markAllRead, markRead, MAX_MESSAGES, unreadCount, type NewMessage } from '../inbox';

const msg = (title: string): NewMessage => ({ date: '2026-07-01', category: 'transfer', from: 'Chief Scout', title, body: '' });

describe('inbox', () => {
  it('adds messages newest first, unread, with unique sequential ids', () => {
    const one = addMessages([], [msg('a')]);
    const two = addMessages(one, [msg('b'), msg('c')]);
    expect(two.map((m) => m.title)).toEqual(['c', 'b', 'a']);
    expect(two.map((m) => m.id)).toEqual(['msg_3', 'msg_2', 'msg_1']);
    expect(unreadCount(two)).toBe(3);
    two.forEach((m) => expect(InboxMessageSchema.safeParse(m).success).toBe(true));
  });

  it('marks one or all as read, immutably', () => {
    const inbox = addMessages([], [msg('a'), msg('b')]);
    const one = markRead(inbox, inbox[0].id);
    expect(unreadCount(one)).toBe(1);
    expect(unreadCount(inbox)).toBe(2);
    expect(unreadCount(markAllRead(inbox))).toBe(0);
  });

  it(`keeps only the newest ${MAX_MESSAGES}`, () => {
    let inbox = addMessages([], []);
    for (let i = 0; i < MAX_MESSAGES + 15; i++) inbox = addMessages(inbox, [msg(`m${i}`)]);
    expect(inbox).toHaveLength(MAX_MESSAGES);
    expect(inbox[0].title).toBe(`m${MAX_MESSAGES + 14}`);
    // Ids keep counting up even after old messages are dropped.
    expect(new Set(inbox.map((m) => m.id)).size).toBe(MAX_MESSAGES);
  });
});
