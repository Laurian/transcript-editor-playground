import uuidv5 from 'uuid/v5';
import bs58 from 'bs58';
import toBuffer from 'typedarray-to-buffer';
import shortid from 'shortid';

import transcript from './transcript';

const NAMESPACE = '696fdeb0-9404-11e9-aa9c-518ba77d48f0';
const translateID = id => bs58.encode(toBuffer(uuidv5(id, NAMESPACE, new Array(), 0)));

const generateID = () => {
  let id = null;
  do {
    id = shortid.generate();
  } while (!id.match(/^[a-z]([0-9]|[a-z])+([0-9a-z]+)[a-z]$/i));

  return id;
};

const { id, title, language, words, speakers } = transcript;
const dict = {};
const segments = words.reduce((acc, { duration, time, paragraphId, value, speaker, strikethrough }) => {
  let p = acc.length > 0 ? acc[acc.length - 1] : {};
  const word = {
    id: generateID(),
    text: value.trim(),
    start: time,
    duration,
    end: time + duration,
  };

  let fid = dict[paragraphId];
  if (!fid) {
    fid = generateID();
    dict[paragraphId] = fid;
  }

  if (p.id !== fid) {
    if (p.id) {
      p.text = p.words.map(({ text }) => text).join(' ');
      p.length = p.text.length;

      p.words = p.words.reduce((acc, w, i, arr) => {
        w.offset = 0;
        if (i > 0) w.offset = arr[i - 1].offset + arr[i - 1].length + 1;
        w.length = w.text.length;
        return [...acc, w];
      }, []);

      if (p.words.length > 0) {
        p.start = p.words[0].start;
        p.end = p.words[p.words.length - 1].end;
      }
    }

    return [...acc, {
      id: fid,
      speaker: speakers[speaker] ? speakers[speaker].name : null,
      words: [word],
    }];
  }

  p.words.push(word);
  return acc;
}, []);

segments.pop(); // FIXME this kills last para


console.log(generateID());
console.log(segments);

const object = {
  id: translateID(id),
  title,
  language,
  // speakers,
  segments,
  // segments: segments.filter((s, i) => i < 5),
};

export default object;
