/**
 * One quotation a day on Today, the same for everyone that day. No model, no database: a short list, worked through in order.
 *
 * Why the list is what it is. The internet is full of quotations given to the wrong person ("never too late to be what you
 * might have been" is not George Eliot; "write it on your heart that every day is the best day in the year" is a patchwork,
 * not an Emerson sentence). So every line here is taken from a named work, the work and year are shown with it so anyone can
 * check, and the people are writers who died long ago, in the original English (or a translation that is itself old), so
 * nothing in it is anyone's to charge for. To add one: find it in the work itself, not on a quotations site.
 */

export type DailyQuote = {
  text: string;
  author: string;
  /** The work it comes from, so it can be checked. */
  work: string;
  /** When it was written or first published. */
  year: number;
  /** The date is approximate (the plays, an old almanack, a poem written long before it was printed): shown as "c. 1598". */
  circa?: true;
};

/** In the order they are shown, arranged so that neighbouring days differ in voice and in subject. */
export const QUOTES: DailyQuote[] = [
  { text: "Come, my friends, 'tis not too late to seek a newer world.", author: "Alfred, Lord Tennyson", work: "Ulysses", year: 1842 },
  { text: "I think that I cannot preserve my health and spirits, unless I spend four hours a day at least … sauntering through the woods and over the hills and fields, absolutely free from all worldly engagements.", author: "Henry David Thoreau", work: "Walking", year: 1862 },
  { text: "No one is useless in this world who lightens the burden of it for any one else.", author: "Charles Dickens", work: "Our Mutual Friend", year: 1865 },
  { text: "How far that little candle throws his beams! So shines a good deed in a naughty world.", author: "William Shakespeare", work: "The Merchant of Venice", year: 1598, circa: true },
  { text: "Grow old along with me! The best is yet to be, the last of life, for which the first was made.", author: "Robert Browning", work: "Rabbi Ben Ezra", year: 1864 },
  { text: "What is this life if, full of care, we have no time to stand and stare?", author: "W. H. Davies", work: "Leisure", year: 1911 },
  { text: "Nothing great was ever achieved without enthusiasm.", author: "Ralph Waldo Emerson", work: "Circles", year: 1841 },
  { text: "To travel hopefully is a better thing than to arrive, and the true success is to labour.", author: "Robert Louis Stevenson", work: "Virginibus Puerisque", year: 1881 },
  { text: "For age is opportunity no less than youth itself, though in another dress.", author: "Henry Wadsworth Longfellow", work: "Morituri Salutamus", year: 1875 },
  { text: "There is no charm equal to tenderness of heart.", author: "Jane Austen", work: "Emma", year: 1815 },
  { text: "Time is but the stream I go a-fishing in.", author: "Henry David Thoreau", work: "Walden", year: 1854 },
  { text: "Something hidden. Go and find it. Go and look behind the Ranges — something lost behind the Ranges. Lost and waiting for you. Go!", author: "Rudyard Kipling", work: "The Explorer", year: 1898, circa: true },
  { text: "What do we live for, if it is not to make life less difficult to each other?", author: "George Eliot", work: "Middlemarch", year: 1872 },
  { text: "Afoot and light-hearted I take to the open road, healthy, free, the world before me.", author: "Walt Whitman", work: "Song of the Open Road", year: 1856 },
  { text: "Hope is the thing with feathers that perches in the soul.", author: "Emily Dickinson", work: "Hope is the thing with feathers", year: 1891 },
  { text: "Our doubts are traitors, and make us lose the good we oft might win, by fearing to attempt.", author: "William Shakespeare", work: "Measure for Measure", year: 1604, circa: true },
  { text: "Not enjoyment, and not sorrow, is our destined end or way; but to act, that each to-morrow find us farther than to-day.", author: "Henry Wadsworth Longfellow", work: "A Psalm of Life", year: 1838 },
  { text: "Climb the mountains and get their good tidings.", author: "John Muir", work: "Our National Parks", year: 1901 },
  { text: "Nothing will ever be attempted, if all possible objections must be first overcome.", author: "Samuel Johnson", work: "Rasselas", year: 1759 },
  { text: "To see a World in a Grain of Sand and a Heaven in a Wild Flower.", author: "William Blake", work: "Auguries of Innocence", year: 1803, circa: true },
  { text: "Think only of the past as its remembrance gives you pleasure.", author: "Jane Austen", work: "Pride and Prejudice", year: 1813 },
  { text: "Ah, but a man's reach should exceed his grasp, or what's a heaven for?", author: "Robert Browning", work: "Andrea del Sarto", year: 1855 },
  { text: "The only way to have a friend is to be one.", author: "Ralph Waldo Emerson", work: "Friendship", year: 1841 },
  { text: "It's no use going back to yesterday, because I was a different person then.", author: "Lewis Carroll", work: "Alice's Adventures in Wonderland", year: 1865 },
  { text: "Well done is better than well said.", author: "Benjamin Franklin", work: "Poor Richard's Almanack", year: 1737, circa: true },
  { text: "And 'tis my faith that every flower enjoys the air it breathes.", author: "William Wordsworth", work: "Lines Written in Early Spring", year: 1798 },
  { text: "Small cheer and great welcome makes a merry feast.", author: "William Shakespeare", work: "The Comedy of Errors", year: 1594, circa: true },
  { text: "Such as are thy habitual thoughts, such also will be the character of thy mind; for the soul is dyed by the thoughts.", author: "Marcus Aurelius", work: "Meditations, translated by George Long", year: 1862 },
  { text: "I loafe and invite my soul, I lean and loafe at my ease, observing a spear of summer grass.", author: "Walt Whitman", work: "Song of Myself", year: 1855 },
  { text: "Variety's the very spice of life, that gives it all its flavour.", author: "William Cowper", work: "The Task", year: 1785 },
  { text: "I have been bent and broken, but — I hope — into a better shape.", author: "Charles Dickens", work: "Great Expectations", year: 1861 },
  { text: "There is no wealth but life.", author: "John Ruskin", work: "Unto This Last", year: 1860 },
  { text: "To live is the rarest thing in the world. Most people exist, that is all.", author: "Oscar Wilde", work: "The Soul of Man under Socialism", year: 1891 },
  { text: "I am no bird; and no net ensnares me: I am a free human being with an independent will.", author: "Charlotte Brontë", work: "Jane Eyre", year: 1847 },
  { text: "The earth laughs in flowers.", author: "Ralph Waldo Emerson", work: "Hamatreya", year: 1847 },
  { text: "The question is not what you look at, but what you see.", author: "Henry David Thoreau", work: "Journal", year: 1851 },
  { text: "There is nothing either good or bad, but thinking makes it so.", author: "William Shakespeare", work: "Hamlet", year: 1600, circa: true },
  { text: "The mountains are calling and I must go.", author: "John Muir", work: "Letter to his sister Sarah", year: 1873 },
  { text: "A thing of beauty is a joy for ever.", author: "John Keats", work: "Endymion", year: 1818 },
  { text: "We know what we are, but know not what we may be.", author: "William Shakespeare", work: "Hamlet", year: 1600, circa: true },
  { text: "Not till we are lost, in other words, not till we have lost the world, do we begin to find ourselves, and realize where we are and the infinite extent of our relations.", author: "Henry David Thoreau", work: "Walden", year: 1854 },
  { text: "Energy is eternal delight.", author: "William Blake", work: "The Marriage of Heaven and Hell", year: 1790, circa: true },
  { text: "To strive, to seek, to find, and not to yield.", author: "Alfred, Lord Tennyson", work: "Ulysses", year: 1842 },
  { text: "If one advances confidently in the direction of his dreams, and endeavors to live the life which he has imagined, he will meet with a success unexpected in common hours.", author: "Henry David Thoreau", work: "Walden", year: 1854 },
  { text: "'Tis better to have loved and lost than never to have loved at all.", author: "Alfred, Lord Tennyson", work: "In Memoriam A. H. H.", year: 1850 },
];

const DAY_MS = 86_400_000;

/** Whole days since 1 January 1970 for a calendar date (YYYY-MM-DD), the same wherever the server is. */
function dayNumber(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** The quotation for a calendar date: the next in the list each day, back to the first when it runs out. Pure. */
export function quoteForDate(isoDate: string): DailyQuote {
  const index = ((dayNumber(isoDate) % QUOTES.length) + QUOTES.length) % QUOTES.length;
  return QUOTES[index];
}

/** "Alfred, Lord Tennyson, Ulysses (1842)", or "William Shakespeare, Hamlet (c. 1600)". */
export function attribution(q: DailyQuote): string {
  return `${q.author}, ${q.work} (${q.circa ? "c. " : ""}${q.year})`;
}
