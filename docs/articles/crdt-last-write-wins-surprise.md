# The Surprising Truth About "Last Write Wins" in CRDTs

If you're using a CRDT library like Yjs, Automerge, or similar, you might assume "Last Write Wins" means the person who saved _last_ wins. That's intuitive, right?

**Wrong.** And this surprised me too.

## The Setup

You have a collaborative app. Two users edit the same field:

- Alice edits at 2:00pm: `title = "Draft"`
- Bob edits at 3:00pm: `title = "Final"`

They sync. What does everyone see?

If you said "Final" because Bob edited later... you'd be wrong about 50% of the time.

## What Actually Happens

Most CRDT libraries (like Yjs, the backbone of apps like Notion, Figma plugins, and countless collaborative tools) don't use wall-clock timestamps at all.

Instead, they use something called **clientID ordering**. Each device gets a random ID when it connects. When conflicts happen, the device with the _higher_ ID wins.

```
Alice's laptop: clientID = 500
Bob's phone: clientID = 800

Bob wins. Not because he edited later, but because 800 > 500.
```

But what if:

```
Alice's laptop: clientID = 900
Bob's phone: clientID = 200

Alice wins. Even though Bob edited an hour later.
```

## Why Would Anyone Design It This Way?

Because timestamps are broken in distributed systems.

**Clock skew is real:**

- Your laptop might be 5 minutes ahead
- Your phone might be 2 minutes behind
- That VM in the cloud? Who knows

**NTP isn't reliable:**

- Clocks can jump backward during sync
- Offline devices don't sync at all
- Different timezones, different configurations

**The result:** If you use timestamps, Alice's fast clock means she _always_ wins, even when Bob edited genuinely later. That's worse than random.

ClientID ordering is arbitrary, but it's _deterministic_. Every device will converge to the same state. That's the actual goal of CRDTs: convergence, not fairness.

## But I Really Want "Later Edit Wins"

You can build it yourself. Libraries like `y-lwwmap` add timestamps on top of Yjs:

```typescript
// Each write includes a timestamp
map.set('title', {
	value: 'Final',
	timestamp: Date.now(),
	authorId: myClientId,
});

// On conflict, higher timestamp wins
// Tie-breaker: hash of value (deterministic)
```

**The tradeoffs you accept:**

- Clock skew can still cause "earlier" to win if clocks disagree
- You need tombstones for deletes (30-day retention typical)
- More storage, more complexity
- You're betting your devices have decent clocks

For most apps, this tradeoff is fine. Your users' devices probably have NTP. But now you know it's a _choice_, not a guarantee.

## The Real Solution: Avoid Conflicts

The best conflict resolution is no conflict at all.

Instead of storing a whole object under one key:

```typescript
// BAD: One key for entire field definition
schema.set('title', {
	type: 'text',
	nullable: true,
	default: 'Untitled',
});
// If Alice changes nullable and Bob changes default,
// ONE OF THEM LOSES ENTIRELY
```

Use nested structures:

```typescript
// GOOD: Each property is a separate key
schema.get('title').set('type', 'text');
schema.get('title').set('nullable', true);
schema.get('title').set('default', 'Untitled');
// Alice and Bob edit different keys = no conflict
```

Now Alice's `nullable` change and Bob's `default` change both survive. Conflict eliminated.

## TL;DR

1. **"Last Write Wins" in CRDTs usually means "highest clientID wins"**, not "latest timestamp wins"
2. **This is intentional** because timestamps are unreliable in distributed systems
3. **You can add timestamps yourself** if you accept the clock skew tradeoffs
4. **The best solution is designing your data** so conflicts rarely happen

Next time you're building a collaborative feature, remember: the "last" in Last Write Wins might not be what you think.

---

_Further reading:_

- [Yjs Internals](https://github.com/yjs/yjs/blob/main/INTERNALS.md)
- [y-lwwmap](https://github.com/rozek/y-lwwmap) - Timestamp-based LWW for Yjs
- [Automerge Conflicts](https://automerge.org/docs/reference/documents/conflicts) - Alternative that exposes all conflicting values
