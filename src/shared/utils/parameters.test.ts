import { describe, expect, it } from 'vitest';
import { switchedUrl } from './parameters';

describe('switchedUrl on the AWS console', () => {
  it('drops the region parameter, which would otherwise send you back', () => {
    // The reported case: the region is in the host and in the query string, and the
    // query string is the one the console obeys.
    expect(
      switchedUrl(
        'https://eu-west-1.console.aws.amazon.com/console/home?region=eu-west-1#',
        'eu-central-1.console.aws.amazon.com',
      ),
      // The bare `#` the reported URL ends with is kept: it is in the input, it means
      // nothing to the page, and dropping it would be this function editing an address
      // for tidiness.
    ).toBe('https://eu-central-1.console.aws.amazon.com/console/home#');
  });

  it('drops it from a query kept in the hash too', () => {
    expect(
      switchedUrl(
        'https://eu-west-1.console.aws.amazon.com/ec2/home#/instances?region=eu-west-1&page=2',
        'us-east-1.console.aws.amazon.com',
      ),
    ).toBe('https://us-east-1.console.aws.amazon.com/ec2/home#/instances?page=2');
  });

  it('leaves no dangling question mark when region was the only parameter', () => {
    expect(
      switchedUrl(
        'https://eu-west-1.console.aws.amazon.com/ec2/home#/instances?region=eu-west-1',
        'us-east-1.console.aws.amazon.com',
      ),
    ).toBe('https://us-east-1.console.aws.amazon.com/ec2/home#/instances');
  });

  it('keeps every other parameter exactly as it was', () => {
    expect(
      switchedUrl(
        'https://eu-west-1.console.aws.amazon.com/s3/buckets?region=eu-west-1&prefix=a%20b&sort=name',
        'us-east-1.console.aws.amazon.com',
      ),
    ).toBe('https://us-east-1.console.aws.amazon.com/s3/buckets?prefix=a%20b&sort=name');
  });

  it('covers the China and GovCloud partitions, which behave the same', () => {
    expect(
      switchedUrl(
        'https://cn-north-1.console.amazonaws.cn/console/home?region=cn-north-1',
        'cn-northwest-1.console.amazonaws.cn',
      ),
    ).toBe('https://cn-northwest-1.console.amazonaws.cn/console/home');

    expect(
      switchedUrl(
        'https://us-gov-west-1.console.amazonaws-us-gov.com/home?region=us-gov-west-1',
        'us-gov-east-1.console.amazonaws-us-gov.com',
      ),
    ).toBe('https://us-gov-east-1.console.amazonaws-us-gov.com/home');
  });

  it('does nothing beyond the host when there is no region parameter', () => {
    expect(
      switchedUrl(
        'https://eu-west-1.console.aws.amazon.com/ec2/home#/instances',
        'us-east-1.console.aws.amazon.com',
      ),
    ).toBe('https://us-east-1.console.aws.amazon.com/ec2/home#/instances');
  });
});

describe('switchedUrl elsewhere', () => {
  it('leaves a region parameter alone on a site that is not one of these consoles', () => {
    // The rule is named per site precisely so it cannot reach anybody else's
    // parameters, however similar they look.
    expect(
      switchedUrl('https://app.example.com/map?region=eu-west-1&zoom=8', 'dev.example.com'),
    ).toBe('https://dev.example.com/map?region=eu-west-1&zoom=8');
  });

  it('keeps the path, query and hash', () => {
    expect(switchedUrl('https://app.example.com/a/b?x=1&y=2#/route?z=3', 'dev.example.com')).toBe(
      'https://dev.example.com/a/b?x=1&y=2#/route?z=3',
    );
  });

  it('is not fooled by a host that merely ends in a similar string', () => {
    expect(
      switchedUrl(
        'https://console.aws.amazon.com.evil.example/?region=eu-west-1',
        'other.aws.amazon.com.evil.example',
      ),
    ).toBe('https://other.aws.amazon.com.evil.example/?region=eu-west-1');
  });
});
