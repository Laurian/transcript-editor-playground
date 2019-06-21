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

class App extends React.Component {
  state = {
    readOnly: false,
  };

  player = React.createRef();

  static getDerivedStateFromProps(props, state) {
    const { transcript } = props;
    if (transcript && !state.editorStates) {
      const editorStatesArray = chunk(transcript.segments, 5).map(segments => {
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
          inlineStyleRanges: [],
        }));

        const entityMap = flatten(blocks.map(block => block.entityRanges)).reduce(
          (acc, data) => ({
            ...acc,
            [data.key]: { type: 'TOKEN', mutability: 'MUTABLE', data },
          }),
          {}
        );

        return EditorState.createWithContent(convertFromRaw({ blocks, entityMap }), decorator);
      });
      const editorStates = editorStatesArray.reduce((acc, s, i) => ({ ...acc, [`editor-${i}`]: s }), {});

      const previewEditorStatesArray = Object.values(editorStates).map(editorState =>
        EditorState.createWithContent(
          convertFromRaw({
            blocks: convertToRaw(editorState.getCurrentContent()).blocks.map(block => ({
              ...block,
              entityRanges: [],
            })),
            entityMap: {},
          }),
          decorator
        )
      );
      const previewEditorStates = previewEditorStatesArray.reduce((acc, s, i) => ({ ...acc, [`editor-${i}`]: s }), {});

      const editors = editorStatesArray.map((s, i) => `editor-${i}`);

      return { editorStates, previewEditorStates, editors };
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

    Object.entries(this.state.editorStates).forEach(([editorKey, editorState]) => {
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
            playheadEditorKey: editorKey,
            playheadBlockKey: playheadBlock.getKey(),
            playheadEntityKey: key,
          });
        } else {
          this.setState({ playheadEditorKey: editorKey, playheadBlockKey: playheadBlock.getKey() });
        }
      }
    });
  };

  onChange = (editorState, editorKey) => {
    const previewEditorState = EditorState.createWithContent(
      convertFromRaw({
        blocks: convertToRaw(editorState.getCurrentContent()).blocks.map(block => ({ ...block, entityRanges: [] })),
        entityMap: {},
      }),
      decorator
    );

    this.setState({
      editorStates: { ...this.state.editorStates, [editorKey]: editorState },
      previewEditorStates: { ...this.state.previewEditorStates, [editorKey]: previewEditorState },
    });
  };

  renderEditor = editorKey => {
    return (
      <section key={`s-${editorKey}`} data-editor-key={editorKey}>
        <VisibilitySensor key={`vs-${editorKey}`} intervalCheck={false} scrollCheck={true} partialVisibility={true}>
          {({ isVisible }) => (
            <Editor
              editorKey={editorKey}
              readOnly={!isVisible}
              stripPastedStyles
              editorState={isVisible ? this.state.editorStates[editorKey] : this.state.previewEditorStates[editorKey]}
              blockRendererFn={this.customBlockRenderer}
              onChange={editorState => this.onChange(editorState, editorKey)}
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
          {this.state.editors.map(key => this.renderEditor(key))}
        </div>
      </article>
    );
  }
}

export default App;
