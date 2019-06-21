import React, { Component } from 'react';
import { EditorBlock } from 'draft-js';
// import VisibilitySensor from 'react-visibility-sensor';
// import TimecodeBlock from './TimecodeBlock';


class WrapperBlock extends Component {
  render() {
    const { block } = this.props;
    // const key = block.getKey();

    // const id = block.getData().get('id') || key;
    const speaker = block.getData().get('speaker') || '';

    return (
      <div className="WrapperBlock">
        <div contentEditable={false} className="speaker">{speaker}:</div>
        <EditorBlock {...this.props} />
      </div>
    );
  }
}


export default WrapperBlock;
