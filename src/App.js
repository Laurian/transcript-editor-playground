import React from 'react';
import Draft, { Editor, EditorState, CompositeDecorator, convertFromRaw, convertToRaw, getDefaultKeyBinding, Modifier } from 'draft-js';
import chunk from 'lodash.chunk';
import VisibilitySensor from 'react-visibility-sensor';


import WrapperBlock from './WrapperBlock';
import Token from './Token';

import './App.css';

const flatten = list => list.reduce((a, b) => a.concat(Array.isArray(b) ? flatten(b) : b), []);


const getEntityStrategy = mutability => (contentBlock, callback, contentState) => {
  contentBlock.findEntityRanges(
    (character) => {
      const entityKey = character.getEntity();
      if (entityKey === null) {
        return false;
      }
      return contentState.getEntity(entityKey).getMutability() === mutability;
    },
    callback,
  );
};

const decorator = new CompositeDecorator([
  {
    strategy: getEntityStrategy('MUTABLE'),
    component: Token,
  },
]);

class App extends React.Component {
  state = {
    readOnly: false,
  };

  player = React.createRef();

  static getDerivedStateFromProps(props, state) {
    const { transcript } = props;
    if (transcript && !state.editorStates) {
      const editorStates = chunk(transcript.segments, 5).map(segments => {
        const blocks = segments.map(({ text, start, end, speaker, id, words }, index) => ({
          text,
          key: id,
          type: 'paragraph',
          data: { start, end, speaker, id },
          entityRanges: words.map(({ start, end, text, offset, length, id }) => ({ start, end, text, offset, length, key: id })),
          inlineStyleRanges: [],
        }));

        const entityMap = flatten(blocks.map(block => block.entityRanges)).reduce((acc, data) => ({
          ...acc,
          [data.key]: { type: 'TOKEN', mutability: 'MUTABLE', data },
        }), {});

        return EditorState.createWithContent(convertFromRaw({ blocks, entityMap }), decorator);
      }).reduce((acc, s, i) => ({...acc, [`editor-${i}`]: s}), {});

      const previewEditorStates = Object.values(editorStates).map(editorState => EditorState.createWithContent(convertFromRaw({ blocks: convertToRaw(editorState.getCurrentContent()).blocks.map(block => ({...block, entityRanges: []})), entityMap: {}}), decorator)).reduce((acc, s, i) => ({...acc, [`editor-${i}`]: s}), {});

      return { editorStates, previewEditorStates };
    }
  }

  customBlockRenderer = contentBlock => {
    const type = contentBlock.getType();
    if (type === 'paragraph') {
      return {
        component: WrapperBlock,
        props: {
        },
      };
    }
    return null;
  }

  handleClick = event => {
    let element = event.nativeEvent.target;
    while (!element.hasAttribute('data-start') && element.parentElement) element = element.parentElement;
    if (element.hasAttribute('data-start')) {
      const t = parseFloat(element.getAttribute('data-start'));
      this.player.current.currentTime = t / 1e3;
    } else {
      element = event.nativeEvent.target;
      while (!element.hasAttribute('data-block') && element.parentElement) element = element.parentElement;
      if (element.hasAttribute('data-block') && element.hasAttribute('data-offset-key')) {
        const blockKey = element.getAttribute('data-offset-key').split('-').reverse().pop();
        console.log(blockKey);
      }
    }
  }

  onTimeUpdate = event => {
    const time = this.player.current.currentTime * 1e3;

    Object.values(this.state.editorStates).map(editorState => {
      const contentState = editorState.getCurrentContent();
      const blocks = contentState.getBlocksAsArray();
      let playheadBlockIndex = -1;

      playheadBlockIndex = blocks.findIndex(block => {
        const start = block.getData().get('start');
        const end = block.getData().get('end');
        return start <= time && time < end;
      });
      // console.log(`playheadBlockIndex: ${playheadBlockIndex} @${time}`);

      if (playheadBlockIndex > -1) {
        const playheadBlock = blocks[playheadBlockIndex];
        // console.log(`playheadBlock: ${playheadBlock.getKey()} ${this.state.segments[playheadBlock.getData().get('id') || playheadBlock.getKey()].start} - ${this.state.segments[playheadBlock.getData().get('id') || playheadBlock.getKey()].end}`);
        const playheadEntity = [...new Set(playheadBlock.getCharacterList().toArray().map(character => character.getEntity()))].filter(value => !!value).find((entity) => {
          const { start, end } = contentState.getEntity(entity).getData();
          return start <= time && time < end;
        });

        if (playheadEntity) {
          const { key } = contentState.getEntity(playheadEntity).getData();
          // console.log(`playheadBlockKey: ${playheadBlock.getKey()} playheadEntityKey: ${key}`);
          this.setState({ playheadBlockKey: playheadBlock.getKey(), playheadEntityKey: key });
        } else {
          // console.log(`playheadBlockKey: ${playheadBlock.getKey()}`);
          this.setState({ playheadBlockKey: playheadBlock.getKey() });
        }
      }
    });
  }

  onChange = (editorState, editorKey) => {
    const previewEditorState = EditorState.createWithContent(convertFromRaw({ blocks: convertToRaw(editorState.getCurrentContent()).blocks.map(block => ({...block, entityRanges: []})), entityMap: {}}), decorator);

    this.setState({
      editorStates: {...this.state.editorStates, [editorKey]: editorState},
      previewEditorStates: {...this.state.previewEditorStates, [editorKey]: previewEditorState},
    });
  }

  renderEditor = editorKey => {
    return (
      <section key={`s-${editorKey}`} data-editor-key={editorKey}>
        <VisibilitySensor key={`vs-${editorKey}`} intervalCheck={false} scrollCheck={true} partialVisibility={true}>
          {
            ({ isVisible }) => {
              console.log(editorKey, isVisible);
              return (<Editor
                editorKey={editorKey}
                readOnly={!isVisible}
                stripPastedStyles
                editorState={isVisible ? this.state.editorStates[editorKey] : this.state.previewEditorStates[editorKey]}
                blockRendererFn={this.customBlockRenderer}
                onChange={editorState => this.onChange(editorState, editorKey)}
              />);
            }
          }
        </VisibilitySensor>
      </section>
    );
  }

  render() {
    return (
      <article>
        <h1>{this.props.transcript.title}</h1>
        <audio
          preload
          controls
          onTimeUpdate={event => this.onTimeUpdate(event)}
          ref={this.player}
          src="https://m-nc9x4fbvxfm4jhb9.s3.amazonaws.com/566f3519e358eb0b2163b15e/9282246788451/e90f9f80-70e4-4de4-8670-54ed115b95bd/9aM-W2buTmSXNHOpDZnQ-Q.m4a"
        >

        </audio>
        <div onClick={event => this.handleClick(event)}>
        <style scoped>
          { `div[data-offset-key="${this.state.currentBlockKey}-0-0"] > .WrapperBlock > div[data-offset-key] > span { color: black; }` }
          { `div[data-offset-key="${this.state.playheadBlockKey}-0-0"] ~ div > .WrapperBlock > div[data-offset-key] > span { color: #696969; }` }
          { `span[data-entity-key="${this.state.playheadEntityKey}"] ~ span[data-entity-key] { color: #696969; }` }
        </style>
        {Object.keys(this.state.editorStates).map(key => this.renderEditor(key))}
        </div>
      </article>
    );
  }
}


export default App;


