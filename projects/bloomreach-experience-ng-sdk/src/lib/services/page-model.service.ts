/*
 * Copyright 2019 Hippo B.V. (http://www.onehippo.com)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Inject, Injectable, Injector, PLATFORM_ID} from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of, Subject} from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { ApiUrlsService } from './api-urls.service';
import { RequestContextService } from './request-context.service';
import {
  _buildApiUrl,
  _getContentViaReference,
  _logUpdateComponent,
  _updateComponent,
  updatePageMetaData,
  toUrlEncodedFormData
} from '../common-sdk/utils/page-model';
import {makeStateKey, TransferState} from '@angular/platform-browser';
import {isPlatformServer} from '@angular/common';

@Injectable({ providedIn: 'root' })
export class PageModelService {
  channelManagerApi: any;
  pageModel: any;
  pageModelSubject: Subject<any> = new BehaviorSubject<any>(this.pageModel);
  private transferState: TransferState = null;

  private httpGetOptions = {
    withCredentials: true
  };

  private httpPostOptions = {
    withCredentials: true,
    headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' })
  };

  constructor(
    private apiUrlsService: ApiUrlsService,
    private requestContextService: RequestContextService,
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId,
    private injector: Injector
  ) {  }

  fetchPageModel() {
    const apiUrl: string = this.buildApiUrl();
    const PAGE_KEY = makeStateKey<any>('pagemodel');

    // check if transferState is enabled
    if (this.requestContextService.getTransferState()) {
      this.transferState = <TransferState> this.injector.get(TransferState);
    }

    // Check if TransferState is enabled and to see if Page model exists on transferState
    if (this.requestContextService.getTransferState() && this.transferState.hasKey(PAGE_KEY)) {
      this.pageModel  = this.transferState.get<any>(PAGE_KEY, null);
      this.transferState.remove(PAGE_KEY);
      this.processPageModel();
      return of(this.pageModel );
    } else {

      return this.http.get<any>(apiUrl, this.httpGetOptions).pipe(
        tap(response => {

          // if on server save the page model.
          if ( this.requestContextService.getTransferState() && isPlatformServer(this.platformId)) {
            this.transferState.set(PAGE_KEY, response);
          }

          this.pageModel = response;
          this.processPageModel();
        }),
        catchError(this.handleError('fetchPageModel', undefined))
      );
    }
  }

  private processPageModel (): void {
    this.setPageModelSubject(this.pageModel );
    const preview: boolean = this.requestContextService.isPreviewRequest();
    const debugging: boolean = this.requestContextService.getDebugging();
    updatePageMetaData(this.pageModel.page, this.channelManagerApi, preview, debugging);
  }

  // no subject is needed for some classes that get the page-model after the initial fetch, such as the ImageUrlService
  getPageModel(): any {
    return this.pageModel;
  }

  getPageModelSubject(): Subject<any> {
    return this.pageModelSubject;
  }

  private setPageModelSubject(pageModel: any): void {
    this.pageModelSubject.next(pageModel);
  }

  setChannelManagerApi(channelManagerApi: any): void {
    this.channelManagerApi = channelManagerApi;
  }

  updateComponent(componentId: string, propertiesMap: any): any {
    // TODO: add debugging to requestContextService
    const debugging: boolean = this.requestContextService.getDebugging();
    _logUpdateComponent(componentId, propertiesMap, debugging);

    const body: string = toUrlEncodedFormData(propertiesMap);
    const url: string = this.buildApiUrl(componentId);

    return this.http.post<any>(url, body, this.httpPostOptions).pipe(
      tap(response => {
        const preview: boolean = this.requestContextService.isPreviewRequest();
        this.pageModel = _updateComponent(response, componentId, this.pageModel, this.channelManagerApi, preview, debugging);
        this.setPageModelSubject(this.pageModel);
      }),
      catchError(this.handleError('updateComponent', undefined)));
  }

  getContentViaReference(contentRef: string): any {
    return _getContentViaReference(contentRef, this.pageModel);
  }

  private buildApiUrl(componentId?: string): string {
    const apiUrls = this.apiUrlsService.getApiUrls();
    const preview = this.requestContextService.isPreviewRequest();
    const urlPath = this.requestContextService.getPath();
    const query = this.requestContextService.getQuery();

    return _buildApiUrl(apiUrls, preview, urlPath, query, componentId);
  }

  /**
   * Handle Http operation that failed.
   * Let the app continue.
   * @param operation - name of the operation that failed
   * @param result - optional value to return as the observable result
   */
  private handleError<T>(operation = 'operation', result?: T) {
    return (error: any): Observable<T> => {
      console.log(`${operation} failed: ${error.message}`);
      console.log(error);

      // Let the app keep running by returning an empty result.
      return of(result as T);
    };
  }
}
