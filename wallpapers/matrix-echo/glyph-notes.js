(function (root) {
  'use strict';
  const han = {
    山: ['shān', '地面上高耸的地形，也用来指山峦。'],
    水: ['shuǐ', '自然界中的水，也常用来指河流。'],
    天: ['tiān', '天空，与大地相对。'],
    地: ['dì', '大地、土地，也指人们生活的地方。'],
    日: ['rì', '太阳，也指一天。'],
    月: ['yuè', '月亮，也指月份。'],
    星: ['xīng', '星辰，夜空中可见的星体。'],
    云: ['yún', '由微小水滴或冰晶组成、漂浮在大气中的云。'],
    风: ['fēng', '空气流动形成的自然现象。'],
    雨: ['yǔ', '从云中落向地面的水滴。'],
    春: ['chūn', '一年四季中的春季，草木萌发生长的时节。'],
    秋: ['qiū', '一年四季中的秋季，常与收获相联系。'],
    江: ['jiāng', '较大的河流。'],
    海: ['hǎi', '广阔的咸水水域。'],
    松: ['sōng', '常绿的针叶树，诗画中常用来象征坚韧。'],
    竹: ['zhú', '茎有节的植物，常见于诗词与绘画。'],
    清: ['qīng', '清澈、洁净，也可形容清静。'],
    明: ['míng', '明亮，也有清楚、明白之意。']
  };
  // Unicode character names, rather than inferred word meanings. Yi syllables
  // and Tibetan letters do not have a fixed Chinese translation on their own.
  const yi = ['it', 'ix', 'i', 'ip', 'iet', 'iex', 'ie', 'iep', 'at', 'ax', 'a', 'ap'];
  const tibetan = new Map(Array.from('ཀཁགངཅཆཇཉཏཐདན', (ch, i) =>
    [ch, ['ka', 'kha', 'ga', 'nga', 'ca', 'cha', 'ja', 'nya', 'ta', 'tha', 'da', 'na'][i]]));
  function describe(script, character) {
    if ((script === 'seal' || script === 'kai') && Object.hasOwn(han, character)) {
      const [reading, description] = han[character];
      return { title: `${script === 'seal' ? '小篆' : '楷书'} · ${character}`,
        reading: `${script === 'seal' ? '对应汉字' : '汉字'}「${character}」 · ${reading}`, description };
    }
    const syllable = script === 'yi' ? yi[character.codePointAt(0) - 0xa000] : null;
    if (syllable) return { title: `彝文 · ${character}`, reading: `音节名 · ${syllable}`,
      description: '规范彝文中的音节文字，用于记录彝语语音。单独的音节不对应固定的汉语词义。' };
    const letter = script === 'tibetan' ? tibetan.get(character) : null;
    if (letter) return { title: `藏文 · ${character}`, reading: `字母名 · ${letter}`,
      description: '藏文基本字母之一。这里展示字母本身，具体词义取决于组合与语境。' };
    return null;
  }
  const api = Object.freeze({ describe });
  root.MatrixGlyphNotes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
