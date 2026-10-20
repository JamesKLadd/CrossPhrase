import { isGrammatical } from '../grammar';

const ok = (line: string) => expect([line, isGrammatical(line.split(' '))]).toEqual([line, true]);
const bad = (line: string) => expect([line, isGrammatical(line.split(' '))]).toEqual([line, false]);

describe('the grammar check accepts real English', () => {
  it('sentences, with agreement', () => {
    ['the quiet owl reads', 'she eats the warm toast', 'i will dance with you', 'the tea is very hot', 'i sing and she laughs',
      'an owl sleeps under the moon', 'everyone loves warm pancake', 'we were happy', 'you are brave', 'i was sleepy',
      'this is my book', 'these are my book', 'she does dance', 'the bee buzzes in the garden', 'a big frog hops quickly',
      'they want to dance', 'he slowly eats the toast', 'my owl and i sleep', 'the moon will shine', 'it is a strange night',
      'the owl sing softly', 'grandma has a warm kettle', 'we had tea and toast', 'the old tree is very green',
    ].forEach(ok);
  });

  it('commands, noun phrases and places', () => {
    ['eat the golden toast', 'never wake the sleepy owl', 'dance with me', 'pour the hot tea', 'be very quiet',
      'the quiet old owl', 'a cup of sweet tea', 'the moon and the star', 'warm and sweet tea',
      'under the quiet moon', 'the old kitchen table', 'a garden gnome sleeps', 'softly through the garden', 'oh the moon glows', 'near the old lighthouse',
    ].forEach(ok);
  });
});

describe('the grammar check rejects what people would not write', () => {
  it('the bot used to play these', () => {
    ['i hides new pumpkin', 'us finds bright laugh', 'i she toast very', 'wants that sand rolls',
      'them loves just under toast', 'makes on their dark alien', 'wish with alien was', 'love grow through their morning',
      'night want for eat quickly', 'i hides root pumpkin', 'loves slowly loves still', 'swim without in sunset',
      'a dark eat old wish', 'some sunrise want just', 'i want too burnt',
    ].forEach(bad);
  });

  it('agreement, articles, objects and word order', () => {
    ['she eat the toast', 'i eats the toast', 'they eats toast', 'the owl are happy and', 'i is happy', 'we was happy',
      'a owl sleeps', 'an cat sleeps', 'the owl sleeps the toast', 'the very owl sleeps', 'me eat toast',
      'the the owl sleeps', 'of the moon the', 'quickly very owl', 'will the owl', 'eats the toast',
    ].forEach(bad);
  });
});

describe('the strict check the level bot plays by', () => {
  const strictOk = (line: string) => expect([line, isGrammatical(line.split(' '), { strict: true })]).toEqual([line, true]);
  const strictBad = (line: string) => expect([line, isGrammatical(line.split(' '), { strict: true })]).toEqual([line, false]);

  it('accepts plain English', () => {
    ['she eats the warm toast', 'the quiet owl reads', 'i will dance with you', 'the tea is too hot', 'my owl sleeps',
      'he browses the small dictionary', 'everyone walks to the boat', 'they want to dance', 'eat the golden toast',
      'under the quiet moon', 'a cup of sweet tea', 'this shell or that boat', 'she sings too', 'you and i dance',
      'moon drifts very slowly', 'book with a secret', 'librarian whispers a secret', 'she finds the old map',
      'they want to find the map', 'the tea and the toast', 'a small but brave owl',
    ].forEach(strictOk);
  });

  it('turns down what the looser check lets through', () => {
    // Bare nouns, plural readings of singular nouns, noun pairs, objects for "dance" and co.
    ['muffin eat near dream', 'my space want often', 'book were his paper', 'he walks old book', 'just be those cold cereal',
      'the owl sing softly', 'i dance tea butter', 'the old kitchen table', 'he does dance her beach',
      'cereal for chef flies you', 'everyone loves warm pancake', 'softly moon glows', 'i sing and moon glows',
      'my old old secret', 'of the silver comet', 'some nest and it', 'some sun will have', 'she finds',
    ].forEach((line) => {
      strictBad(line);
    });
  });
});

it('only joins adjectives with "and", "or" or "but"', () => {
  bad('fluffy so golden coffee');
  ok('warm and sweet tea');
});

it('never starts a line with "too"', () => {
  bad('too their universe finds');
  bad('too she eats the toast');
  ok('she eats the toast too');
  ok('the tea is too hot');
});
