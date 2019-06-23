import React from 'react';
import Draft, {
  Editor,
  EditorBlock,
  EditorState,
  CompositeDecorator,
  convertFromRaw,
  convertToRaw,
  getDefaultKeyBinding,
  Modifier,
  RichUtils
} from 'draft-js';
import chunk from 'lodash.chunk';
import VisibilitySensor from 'react-visibility-sensor';

import './App.css';

const flatten = list => list.reduce((a, b) => a.concat(Array.isArray(b) ? flatten(b) : b), []);

const getEntityStrategy = mutability => (contentBlock, callback, contentState) => {
  contentBlock.findEntityRanges(character => {
    const entityKey = character.getEntity();
    return entityKey && contentState.getEntity(entityKey).getMutability() === mutability;
  }, callback);
};

const decorator = new CompositeDecorator([
  {
    strategy: getEntityStrategy('MUTABLE'),
    component: ({ entityKey, contentState, children }) => {
      const data = entityKey ? contentState.getEntity(entityKey).getData() : {};
      return (
        <span data-start={data.start} data-entity-key={data.key} className="Token">
          {children}
        </span>
      );
    },
  },
]);

const colorStyleMap = {
  red: {
    backgroundColor: 'rgba(255, 0, 0, .2)',
  },
  orange: {
    color: 'rgba(255, 127, 0, 1.0)',
  },
  yellow: {
    color: 'rgba(180, 180, 0, 1.0)',
  },
  green: {
    backgroundColor: 'rgba(0, 180, 0, .2)',
  },
  blue: {
    color: 'rgba(0, 0, 255, 1.0)',
  },
  indigo: {
    color: 'rgba(75, 0, 130, 1.0)',
  },
  violet: {
    color: 'rgba(127, 0, 255, 1.0)',
  },
};

const createPreview = editorState => EditorState.createWithContent(
  convertFromRaw({
    blocks: convertToRaw(editorState.getCurrentContent()).blocks.map(block => ({ ...block, entityRanges: [] })),
    entityMap: {},
  }),
  decorator
);

class App extends React.Component {
  state = {
    readOnly: false,
    // editors: [],
  };

  player = React.createRef();

  static getDerivedStateFromProps(props, state) {
    const { transcript } = props;
    if (transcript && !state.editors) {
      const editors = chunk(transcript.segments, 5).map(segments => {
        const blocks = segments.map(({ text, start, end, speaker, id, words }, index) => ({
          text,
          key: id,
          type: 'paragraph',
          data: { start, end, speaker, id },
          entityRanges: words.map(({ start, end, text, offset, length, id }) => ({
            start,
            end,
            text,
            offset,
            length,
            key: id,
          })),
          inlineStyleRanges: [
            {
              length: 15,
              offset: 5,
              style: 'green',
            },
            {
              length: 15,
              offset: 10,
              style: 'red',
            },
            {
              length: 5,
              offset: 7,
              style: 'blue',
            },
          ],
        }));

        const entityMap = flatten(blocks.map(block => block.entityRanges)).reduce(
          (acc, data) => ({
            ...acc,
            [data.key]: { type: 'TOKEN', mutability: 'MUTABLE', data },
          }),
          {}
        );

        const editorState = EditorState.createWithContent(convertFromRaw({ blocks, entityMap }), decorator);
        return { editorState, key: `editor-${blocks[0].key}`, previewState: createPreview(editorState) };
      });

      return { editors };
    }
  }

  customBlockRenderer = contentBlock => {
    const type = contentBlock.getType();
    if (type === 'paragraph') {
      return {
        component: props => {
          const { block } = props;
          const speaker = block.getData().get('speaker') || '';

          return (
            <div className="WrapperBlock">
              <div contentEditable={false} className="speaker">
                {speaker}:
              </div>
              <EditorBlock {...props} />
            </div>
          );
        },
        props: {
          // TODO
        },
      };
    }
    return null;
  };

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
        const blockKey = element
          .getAttribute('data-offset-key')
          .split('-')
          .reverse()
          .pop();
        console.log(blockKey);
      }
    }
  };

  onTimeUpdate = event => {
    const time = this.player.current.currentTime * 1e3;

    this.state.editors.forEach(({editorState, key}) => {
      const contentState = editorState.getCurrentContent();
      const blocks = contentState.getBlocksAsArray();
      let playheadBlockIndex = -1;

      playheadBlockIndex = blocks.findIndex(block => {
        const start = block.getData().get('start');
        const end = block.getData().get('end');
        return start <= time && time < end;
      });

      if (playheadBlockIndex > -1) {
        const playheadBlock = blocks[playheadBlockIndex];
        const playheadEntity = [
          ...new Set(
            playheadBlock
              .getCharacterList()
              .toArray()
              .map(character => character.getEntity())
          ),
        ]
          .filter(value => !!value)
          .find(entity => {
            const { start, end } = contentState.getEntity(entity).getData();
            return start <= time && time < end;
          });

        if (playheadEntity) {
          const { key } = contentState.getEntity(playheadEntity).getData();
          this.setState({
            playheadEditorKey: key,
            playheadBlockKey: playheadBlock.getKey(),
            playheadEntityKey: key,
          });
        } else {
          this.setState({ playheadEditorKey: key, playheadBlockKey: playheadBlock.getKey() });
        }
      }
    });
  };

  onChange = (editorState, key) => {
    const editorIndex = this.state.editors.findIndex(s => s.key === key);
    const contentState = editorState.getCurrentContent();
    const contentChange = contentState === this.state.editors[editorIndex].editorState.getCurrentContent() ? null : editorState.getLastChangeType();
    console.log(contentChange);

    const currentBlockKey = editorState.getSelection().getStartKey();
    console.log(currentBlockKey);

    const blocks = editorState.getCurrentContent().getBlocksAsArray();
    const currentBlockIndex = blocks.findIndex(block => block.getKey() === currentBlockKey);
    console.log(currentBlockIndex);

    if (currentBlockIndex === blocks.length - 1 && editorIndex < this.state.editors.length - 1) {
      const editorState0 = editorState;
      const editorState1 = this.state.editors[editorIndex + 1].editorState;

      const raw0 = convertToRaw(editorState0.getCurrentContent());
      const raw1 = convertToRaw(editorState1.getCurrentContent());

      const blocks0 = raw0.blocks.map(block => ({ ...block, entityRanges: block.entityRanges.map(range => raw0.entityMap[range.key].data) }));
      const blocks1 = raw1.blocks.map(block => ({ ...block, entityRanges: block.entityRanges.map(range => raw1.entityMap[range.key].data) }));

      const blocksA = blocks0.concat(blocks1);

      const entityMapA = flatten(blocksA.map(block => block.entityRanges)).reduce(
        (acc, data) => ({
          ...acc,
          [data.key]: { type: 'TOKEN', mutability: 'MUTABLE', data },
        }),
        {}
      );

      const editorStateA = EditorState.createWithContent(convertFromRaw({
        blocks: blocksA,
        entityMap: entityMapA,
      }), decorator);

      this.setState({
        editors: [
          ...this.state.editors.slice(0, editorIndex),
          { editorState: editorStateA, key, previewState: createPreview(editorState) },
          ...this.state.editors.slice(editorIndex + 2),
        ],
      });
    } else {
      this.setState({
        editors: [
          ...this.state.editors.slice(0, editorIndex),
          { editorState, key, previewState: createPreview(editorState) },
          ...this.state.editors.slice(editorIndex + 1),
        ],
      });
    }
  };

  // handleJoin = () => {
  //   console.log('join');
  //
  //   const s0 = convertToRaw(this.state.editors['editor-0'].getCurrentContent());
  //   const s1 = convertToRaw(this.state.editors['editor-1'].getCurrentContent());
  //
  //   // console.log(s0, s1);
  //
  //   const entityMap0 = s0.entityMap;
  //   const blocks0 = s0.blocks.map(b => ({ ...b, entityRanges: b.entityRanges.map(r => entityMap0[r.key].data) }));
  //
  //   const entityMap1 = s1.entityMap;
  //   const blocks1 = s1.blocks.map(b => ({ ...b, entityRanges: b.entityRanges.map(r => entityMap1[r.key].data) }));
  //
  //   const blocks = blocks0.concat(blocks1);
  //   const entityMap = flatten(blocks.map(block => block.entityRanges)).reduce(
  //     (acc, data) => ({
  //       ...acc,
  //       [data.key]: { type: 'TOKEN', mutability: 'MUTABLE', data },
  //     }),
  //     {}
  //   );
  //
  //   const raw = {
  //     blocks,
  //     entityMap,
  //   };
  //   // console.log(raw);
  //
  //   this.onChange(EditorState.createEmpty(), 'editor-1');
  //   // this.onChange(EditorState.createWithContent(convertFromRaw(raw), decorator), 'editor-0');
  // };

  renderEditor = ({editorState, key, previewState}) => {
    return (
      <section key={`s-${key}`} data-editor-key={key}>
        <VisibilitySensor key={`vs-${key}`} intervalCheck={false} scrollCheck={true} partialVisibility={true}>
          {({ isVisible }) => (
            <Editor
              editorKey={key}
              readOnly={!isVisible}
              stripPastedStyles
              editorState={isVisible ? editorState : previewState }
              blockRendererFn={this.customBlockRenderer}
              customStyleMap={colorStyleMap}
              onChange={editorState => this.onChange(editorState, key)}
            />
          )}
        </VisibilitySensor>
      </section>
    );
  };

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
        ></audio>
        <div onClick={event => this.handleClick(event)}>
          <style scoped>
            {`section[data-editor-key="${this.state.playheadEditorKey}"] ~ section .WrapperBlock > div[data-offset-key] > span { color: #696969 }`}
            {`div[data-offset-key="${this.state.currentBlockKey}-0-0"] > .WrapperBlock > div[data-offset-key] > span { color: black; }`}
            {`div[data-offset-key="${this.state.playheadBlockKey}-0-0"] ~ div > .WrapperBlock > div[data-offset-key] > span { color: #696969; }`}
            {`span[data-entity-key="${this.state.playheadEntityKey}"] ~ span[data-entity-key] { color: #696969; }`}
          </style>
          {this.state.editors.map((editorState, index) => this.renderEditor(editorState))}
        </div>
      </article>
    );
  }
}

export default App;
