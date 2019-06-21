import React, { PureComponent } from 'react';

class Token extends PureComponent {
  render() {
    const data = this.props.entityKey ? this.props.contentState.getEntity(this.props.entityKey).getData() : {};

    // if (this.props.debug) {
    //   return (
    //     <ruby
    //       data-start={data.start}
    //       data-entity-key={data.key}
    //       className="Token"
    //     >
    //       { this.props.children }
    //       <rt contentEditable={false}><span>{data.start}</span><br /><span>{data.end}</span></rt>
    //     </ruby>
    //   );
    // }

    return (
      <span
        data-start={data.start}
        data-entity-key={data.key}
        className="Token"
      >
        { this.props.children }
      </span>
    );
  }
}

export default Token;
