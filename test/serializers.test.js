'use strict'
const { test } = require('tap')
const { sink, once } = require('./helper')
const stdSerializers = require('pino-std-serializers')
const pino = require('../')

const parentSerializers = {
  test: () => 'parent'
}

const childSerializers = {
  test: () => 'child'
}

test('default err namespace error serializer', async ({ is }) => {
  const stream = sink()
  const parent = pino(stream)

  parent.info({ err: ReferenceError('test') })
  const o = await once(stream, 'data')
  is(typeof o.err, 'object')
  is(o.err.type, 'ReferenceError')
  is(o.err.message, 'test')
  is(typeof o.err.stack, 'string')
})

test('custom serializer overrides default err namespace error serializer', async ({ is }) => {
  const stream = sink()
  const parent = pino({
    serializers: {
      err: (e) => ({
        t: e.constructor.name,
        m: e.message,
        s: e.stack
      })
    }
  }, stream)

  parent.info({ err: ReferenceError('test') })
  const o = await once(stream, 'data')
  is(typeof o.err, 'object')
  is(o.err.t, 'ReferenceError')
  is(o.err.m, 'test')
  is(typeof o.err.s, 'string')
})

test('null overrides default err namespace error serializer', async ({ is }) => {
  const stream = sink()
  const parent = pino({ serializers: { err: null } }, stream)

  parent.info({ err: ReferenceError('test') })
  const o = await once(stream, 'data')
  is(typeof o.err, 'object')
  is(typeof o.err.type, 'undefined')
  is(typeof o.err.message, 'undefined')
  is(typeof o.err.stack, 'undefined')
})

test('undefined overrides default err namespace error serializer', async ({ is }) => {
  const stream = sink()
  const parent = pino({ serializers: { err: undefined } }, stream)

  parent.info({ err: ReferenceError('test') })
  const o = await once(stream, 'data')
  is(typeof o.err, 'object')
  is(typeof o.err.type, 'undefined')
  is(typeof o.err.message, 'undefined')
  is(typeof o.err.stack, 'undefined')
})

test('serializers override values', async ({ is }) => {
  const stream = sink()
  const parent = pino({ serializers: parentSerializers }, stream)
  parent.child({ serializers: childSerializers })

  parent.fatal({ test: 'test' })
  const o = await once(stream, 'data')
  is(o.test, 'parent')
})

test('child does not overwrite parent serializers', async ({ is }) => {
  const stream = sink()
  const parent = pino({ serializers: parentSerializers }, stream)
  const child = parent.child({ serializers: childSerializers })

  parent.fatal({ test: 'test' })

  const o = once(stream, 'data')
  is((await o).test, 'parent')
  const o2 = once(stream, 'data')
  child.fatal({ test: 'test' })
  is((await o2).test, 'child')
})

test('Symbol.for(\'pino.serializers\')', async ({ is, isNot, deepEqual }) => {
  const stream = sink()
  const expected = Object.assign({
    err: stdSerializers.err
  }, parentSerializers)
  const parent = pino({ serializers: parentSerializers }, stream)
  const child = parent.child({ a: 'property' })

  deepEqual(parent[Symbol.for('pino.serializers')], expected)
  deepEqual(child[Symbol.for('pino.serializers')], expected)
  is(parent[Symbol.for('pino.serializers')], child[Symbol.for('pino.serializers')])

  const child2 = parent.child({
    serializers: {
      a
    }
  })

  function a () {
    return 'hello'
  }

  isNot(child2[Symbol.for('pino.serializers')], parentSerializers)
  is(child2[Symbol.for('pino.serializers')].a, a)
  is(child2[Symbol.for('pino.serializers')].test, parentSerializers.test)
})

test('children inherit parent serializers', async ({ is }) => {
  const stream = sink()
  const parent = pino({ serializers: parentSerializers }, stream)

  const child = parent.child({ a: 'property' })
  child.fatal({ test: 'test' })
  const o = await once(stream, 'data')
  is(o.test, 'parent')
})

test('children inherit parent Symbol serializers', async ({ is, isNot, deepEqual }) => {
  const stream = sink()
  const symbolSerializers = {
    [Symbol.for('pino.*')]: parentSerializers.test
  }
  const expected = Object.assign({
    err: stdSerializers.err
  }, symbolSerializers)
  const parent = pino({ serializers: symbolSerializers }, stream)

  deepEqual(parent[Symbol.for('pino.serializers')], expected)

  const child = parent.child({
    serializers: {
      [Symbol.for('a')]: a,
      a
    }
  })

  function a () {
    return 'hello'
  }

  isNot(child[Symbol.for('pino.serializers')], symbolSerializers)
  is(child[Symbol.for('pino.serializers')].a, a)
  is(child[Symbol.for('pino.serializers')][Symbol.for('a')], a)
  is(child[Symbol.for('pino.serializers')][Symbol.for('pino.*')], parentSerializers.test)
})

test('children serializers get called', async ({ is }) => {
  const stream = sink()
  const parent = pino({
    test: 'this'
  }, stream)

  const child = parent.child({ a: 'property', serializers: childSerializers })

  child.fatal({ test: 'test' })
  const o = await once(stream, 'data')
  is(o.test, 'child')
})

test('children serializers get called when inherited from parent', async ({ is }) => {
  const stream = sink()
  const parent = pino({
    test: 'this',
    serializers: parentSerializers
  }, stream)

  const child = parent.child({ serializers: { test: function () { return 'pass' } } })

  child.fatal({ test: 'fail' })
  const o = await once(stream, 'data')
  is(o.test, 'pass')
})

test('non-overridden serializers are available in the children', async ({ is }) => {
  const stream = sink()
  const pSerializers = {
    onlyParent: function () { return 'parent' },
    shared: function () { return 'parent' }
  }

  const cSerializers = {
    shared: function () { return 'child' },
    onlyChild: function () { return 'child' }
  }

  const parent = pino({ serializers: pSerializers }, stream)

  const child = parent.child({ serializers: cSerializers })

  const o = once(stream, 'data')
  child.fatal({ shared: 'test' })
  is((await o).shared, 'child')
  const o2 = once(stream, 'data')
  child.fatal({ onlyParent: 'test' })
  is((await o2).onlyParent, 'parent')
  const o3 = once(stream, 'data')
  child.fatal({ onlyChild: 'test' })
  is((await o3).onlyChild, 'child')
  const o4 = once(stream, 'data')
  parent.fatal({ onlyChild: 'test' })
  is((await o4).onlyChild, 'test')
})
